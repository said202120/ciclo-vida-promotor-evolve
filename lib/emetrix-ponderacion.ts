// "Plan B": calculadora de ponderación de los sondeos de Emetrix
// (/emetrix-ponderacion, solo gerente) — respaldo manual mientras se
// resuelve la integración automática con Evolve OS. Este archivo SOLO
// obtiene/guarda datos en la base y delega todo el cálculo a
// lib/emetrix-ponderacion-calc.ts (funciones puras, sin base de datos ni
// pantalla, con sus propias pruebas en lib/emetrix-ponderacion-calc.test.ts)
// — la pantalla, la descarga en Excel y cualquier envío futuro usan
// exactamente esas mismas funciones.
//
// Universo: el headcount SIEMPRE gana sobre el padrón interno, aunque exista
// padrón — el headcount de la cuenta (uno solo, aplica a los 3 KR) o, si se
// manda un override puntual, ese número solo para esa carga. En modo
// headcount, "contestaron"/"cumplen" salen directo del Excel (promotores
// únicos por USUARIO), sin exigir que estén en el padrón. El padrón solo se
// usa como universo (cruzando cada Excel por id_emetrix contra el USUARIO,
// con "no contestó" para quien no aparece) cuando la cuenta NO tiene
// headcount. Sin headcount ni padrón, el universo queda sin definir. Ver
// docs/ficha-tecnica-okr-ponderacion.md para la especificación completa.
//
// Periodo: cada carga pertenece a un mes ("YYYY-MM") — todas las consultas de
// abajo filtran por periodo explícitamente, nunca mezclan cargas de distintos
// meses en un mismo cálculo.

import { sql } from '@vercel/postgres';
import {
  aplanarArbolOkr as aplanarArbolOkrPuro,
  calcularMarca as calcularMarcaPuro,
  calcularMateriales as calcularMaterialesPuro,
  calcularMesaControl as calcularMesaControlPuro,
  calcularPorcentajeRespuesta,
  calcularPorcentajes,
  calcularTotalPonderado,
  construirArbolOkr,
  construirRespuestaOkrLectura,
  detectarYConvertirFormatoLargo as detectarYConvertirFormatoLargoPuro,
  esPeriodoValido,
  formatIndicadorConMeta,
  normalizarColumnaUsuario as normalizarColumnaUsuarioPuro,
  periodoActual,
  periodoInicioISO,
  validarBaseManual,
  ColumnasFaltantesError,
} from './emetrix-ponderacion-calc';
import type {
  EmetrixCarga,
  EmetrixCargaPreview,
  EmetrixEstado,
  EmetrixFilaDetalle,
  EmetrixKpiManualBase,
  EmetrixKr,
  EmetrixOkrResultadoCuenta,
  EmetrixPreguntaResumen,
  EmetrixResultadoCuenta,
  EmetrixUniversoFuente,
  EmetrixVistaCruzadaFila,
} from './types';

// Re-exports: funciones puras que ya usan los API routes importándolas desde
// aquí (parse/route.ts, okr/excel/route.ts) — un solo punto de import para el
// resto de la app, aunque el cálculo viva en el módulo puro.
export {
  ColumnasFaltantesError,
  calcularMarcaPuro as calcularMarca,
  calcularMaterialesPuro as calcularMateriales,
  calcularMesaControlPuro as calcularMesaControl,
  construirRespuestaOkrLectura,
  detectarYConvertirFormatoLargoPuro as detectarYConvertirFormatoLargo,
  esPeriodoValido,
  formatIndicadorConMeta,
  normalizarColumnaUsuarioPuro as normalizarColumnaUsuario,
  periodoActual,
  periodoInicioISO,
  validarBaseManual,
};
export { aplanarArbolOkrPuro as aplanarArbolOkr };

type Calculo = ReturnType<typeof calcularMesaControlPuro>;

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ---- Padrón interno como universo ----

type PromotorPadron = { promotorId: string; nombre: string; idEmetrix: string | null };

/**
 * Padrón de una cuenta: promotores cuyo supervisor asignado pertenece a esa
 * marca (mismo criterio que ya usa el Módulo 1 de capacitaciones para saber
 * "de qué marca es" un promotor). No hay un campo "activo/baja" en
 * promotores — un promotor en el padrón se considera activo mientras siga
 * ahí.
 */
async function fetchPadronPorMarca(marcaId: string): Promise<PromotorPadron[]> {
  const { rows } = await sql.query(
    `select p.id, p.nombre, p.id_emetrix
     from promotores p
     join supervisores s on s.id = p.supervisor_id
     where s.marca_id = $1`,
    [marcaId]
  );
  return rows.map((r) => ({ promotorId: r.id as string, nombre: r.nombre as string, idEmetrix: (r.id_emetrix as string | null) ?? null }));
}

/**
 * Cruza el padrón contra lo que trajo el Excel (por id_emetrix vs USUARIO).
 * Un promotor del padrón sin match = "no_contesto". Lo que sobra del Excel
 * sin dueño en el padrón se regresa aparte, para corregirlo, sin entrar al
 * cálculo.
 */
function cruzarConPadron(
  padron: PromotorPadron[],
  filasExcel: EmetrixFilaDetalle[]
): { filas: EmetrixFilaDetalle[]; cumplieron: number; respondieron: number; usuariosNoEncontrados: string[] } {
  const porUsuarioExcel = new Map<string, EmetrixFilaDetalle>();
  for (const f of filasExcel) {
    porUsuarioExcel.set(normalizar(f.usuario), f);
  }
  const reclamados = new Set<string>();

  const filas: EmetrixFilaDetalle[] = padron.map((p) => {
    const clave = p.idEmetrix ? normalizar(p.idEmetrix) : null;
    const match = clave ? porUsuarioExcel.get(clave) : undefined;
    if (match && clave) {
      reclamados.add(clave);
      return { promotorId: p.promotorId, usuario: match.usuario, posicion: match.posicion, estado: match.estado, detalleFalla: match.detalleFalla };
    }
    return { promotorId: p.promotorId, usuario: p.nombre, posicion: '', estado: 'no_contesto' as EmetrixEstado, detalleFalla: 'No contestó el sondeo' };
  });

  const usuariosNoEncontrados = [...porUsuarioExcel.entries()]
    .filter(([clave]) => !reclamados.has(clave))
    .map(([, f]) => f.usuario);

  return {
    filas,
    cumplieron: filas.filter((f) => f.estado === 'cumple').length,
    respondieron: filas.filter((f) => f.estado !== 'no_contesto').length,
    usuariosNoEncontrados,
  };
}

/**
 * En modo headcount (con padrón existente pero sin usarlo como universo):
 * solo para informar qué USUARIO del Excel no están en el padrón, sin
 * excluir a nadie del cálculo.
 */
function usuariosSinPadron(padron: PromotorPadron[], filasExcel: EmetrixFilaDetalle[]): string[] {
  const idsPadron = new Set(padron.filter((p) => p.idEmetrix).map((p) => normalizar(p.idEmetrix!)));
  return filasExcel.filter((f) => !idsPadron.has(normalizar(f.usuario))).map((f) => f.usuario);
}

/**
 * Decide el universo de una carga. Prioridad: si hay headcount (el de la
 * cuenta, o un `universoOverride` puntual para esta carga), SIEMPRE se usa
 * ese número — aunque exista padrón — y "contestaron"/"cumplen" salen
 * directo del Excel (promotores únicos por USUARIO), SIN exigir que estén en
 * el padrón; si además hay padrón, se informa aparte qué USUARIO del Excel
 * no están en él, pero no se excluye a nadie del cálculo. El padrón solo se
 * usa como universo (cruzando por id_emetrix, con "no contestó" para quien
 * no aparece en el Excel) cuando NO hay headcount. Si no hay headcount NI
 * padrón, el universo queda sin definir — el % de respuesta se muestra "sin
 * universo" y la carga se marca en alerta. En todos los casos, el % de
 * cumplimiento se calcula solo entre quienes contestaron, y si el % de
 * respuesta queda debajo del umbral de la cuenta (80% por default, o no hay
 * universo), la carga se marca en alerta.
 */
export async function armarPreview(marcaId: string, calculo: Calculo, universoOverride: number | null): Promise<EmetrixCargaPreview> {
  const [padron, config] = await Promise.all([fetchPadronPorMarca(marcaId), fetchConfig(marcaId)]);
  const umbralRespuesta = config.umbralRespuesta;
  const universoManual = universoOverride ?? config.headcountManual;

  if (universoManual !== null) {
    const respondieron = calculo.filas.length;
    const { porcentaje, porcentajeRespuesta } = calcularPorcentajes(universoManual, respondieron, calculo.cumplieron);
    return {
      universoUsado: universoManual,
      universoFuente: 'manual',
      cumplieron: calculo.cumplieron,
      respondieron,
      porcentaje,
      porcentajeRespuesta,
      umbralRespuesta,
      enAlerta: porcentajeRespuesta === null || porcentajeRespuesta < umbralRespuesta,
      usuariosNoEncontrados: padron.length > 0 ? usuariosSinPadron(padron, calculo.filas) : [],
      diagnostico: calculo.diagnostico,
      filas: calculo.filas,
      preguntas: calculo.preguntas,
    };
  }

  if (padron.length > 0) {
    const cruce = cruzarConPadron(padron, calculo.filas);
    const universo = padron.length;
    const { porcentaje, porcentajeRespuesta } = calcularPorcentajes(universo, cruce.respondieron, cruce.cumplieron);
    return {
      universoUsado: universo,
      universoFuente: 'padron',
      cumplieron: cruce.cumplieron,
      respondieron: cruce.respondieron,
      porcentaje,
      porcentajeRespuesta,
      umbralRespuesta,
      enAlerta: porcentajeRespuesta === null || porcentajeRespuesta < umbralRespuesta,
      usuariosNoEncontrados: cruce.usuariosNoEncontrados,
      diagnostico: calculo.diagnostico,
      filas: cruce.filas,
      preguntas: calculo.preguntas,
    };
  }

  const respondieron = calculo.filas.length;
  const { porcentaje, porcentajeRespuesta } = calcularPorcentajes(null, respondieron, calculo.cumplieron);
  return {
    universoUsado: null,
    universoFuente: 'sin_universo',
    cumplieron: calculo.cumplieron,
    respondieron,
    porcentaje,
    porcentajeRespuesta,
    umbralRespuesta,
    enAlerta: true,
    usuariosNoEncontrados: [],
    diagnostico: calculo.diagnostico,
    filas: calculo.filas,
    preguntas: calculo.preguntas,
  };
}

/** Periodos ("YYYY-MM") con al menos una carga guardada, más recientes primero, y el periodo actual (aunque no tenga cargas todavía, para poder elegirlo al subir un sondeo nuevo). */
export async function fetchPeriodosEmetrixPonderacion(): Promise<{ periodos: string[]; actual: string }> {
  const { rows } = await sql.query('select distinct periodo from emetrix_ponderacion_cargas');
  const actual = periodoActual();
  const periodos = new Set<string>([actual, ...rows.map((r) => r.periodo as string)]);
  return { periodos: [...periodos].sort().reverse(), actual };
}

/** Vista cruzada por promotor: su estado en cada uno de los 3 KR (solo tiene sentido si la cuenta tiene padrón), para la carga más reciente en modo padrón de ESTE periodo de cada KR. */
export async function fetchVistaCruzada(marcaId: string, periodo: string): Promise<EmetrixVistaCruzadaFila[]> {
  const padron = await fetchPadronPorMarca(marcaId);
  if (padron.length === 0) return [];

  const KRS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
  const estadosPorKr = new Map<EmetrixKr, Map<string, EmetrixEstado>>();

  for (const kr of KRS) {
    const { rows: cargaRows } = await sql.query(
      `select id from emetrix_ponderacion_cargas
       where marca_id = $1 and kr = $2 and periodo = $3 and universo_fuente = 'padron'
       order by cargado_en desc limit 1`,
      [marcaId, kr, periodo]
    );
    if (!cargaRows[0]) continue;
    const { rows: detalleRows } = await sql.query(
      `select promotor_id, estado from emetrix_ponderacion_detalle where carga_id = $1 and promotor_id is not null`,
      [cargaRows[0].id]
    );
    estadosPorKr.set(kr, new Map(detalleRows.map((r) => [r.promotor_id as string, r.estado as EmetrixEstado])));
  }

  return padron.map((p) => ({
    promotorId: p.promotorId,
    nombre: p.nombre,
    mesaControl: estadosPorKr.get('mesa_control')?.get(p.promotorId) ?? null,
    materiales: estadosPorKr.get('materiales')?.get(p.promotorId) ?? null,
    marca: estadosPorKr.get('marca')?.get(p.promotorId) ?? null,
  }));
}

// ---- Persistencia ----

// Pesos default del OKR (propuesta "Habilitación", aprobada por Carlos) —
// aplican a toda cuenta que no tenga un peso explícito guardado en
// emetrix_ponderacion_pesos. Código muerto histórico desde que /emetrix-
// ponderacion se rehizo como espejo del OKR oficial (ver sección 4 de la
// ficha técnica) — el árbol OKR usa pesos fijos (30/40/30), no estos. Sigue
// usado solo dentro de fetchResultadoCuenta, para el modelo de "resultado por
// cuenta" que sigue existiendo como pieza interna (vista cruzada, historial).
const PESO_DEFAULT: Record<EmetrixKr, number> = {
  mesa_control: 30,
  materiales: 40,
  marca: 30,
};
const UMBRAL_RESPUESTA_DEFAULT = 80;

export async function guardarCarga(data: {
  marcaId: string;
  kr: EmetrixKr;
  periodo: string;
  preview: EmetrixCargaPreview;
  incluyeCelular: boolean | null;
  archivoNombre: string;
  cargadoPor: string;
}): Promise<EmetrixCarga> {
  if (!esPeriodoValido(data.periodo)) {
    throw new Error(`Periodo inválido: "${data.periodo}" (debe tener formato YYYY-MM).`);
  }
  const { preview } = data;

  const { rows } = await sql.query(
    `insert into emetrix_ponderacion_cargas
       (marca_id, kr, periodo, universo, universo_fuente, cumplieron, porcentaje, respondieron, usuarios_no_encontrados,
        filas_leidas, filas_sin_usuario, filas_duplicadas, filas_envios_vacios, incluye_celular, archivo_nombre, cargado_por, preguntas_resumen)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
     returning id, cargado_en`,
    [
      data.marcaId,
      data.kr,
      data.periodo,
      preview.universoUsado,
      preview.universoFuente,
      preview.cumplieron,
      preview.porcentaje,
      preview.respondieron,
      preview.usuariosNoEncontrados,
      preview.diagnostico.filasLeidas,
      preview.diagnostico.filasSinUsuario,
      preview.diagnostico.filasDuplicadas,
      preview.diagnostico.enviosVacios,
      data.incluyeCelular,
      data.archivoNombre,
      data.cargadoPor,
      JSON.stringify(preview.preguntas),
    ]
  );
  const cargaId = rows[0].id as string;

  for (const f of preview.filas) {
    await sql.query(
      `insert into emetrix_ponderacion_detalle (carga_id, promotor_id, usuario, posicion, estado, detalle_falla) values ($1, $2, $3, $4, $5, $6)`,
      [cargaId, f.promotorId, f.usuario, f.posicion, f.estado, f.detalleFalla]
    );
  }

  // Recuerda la respuesta de "¿incluye celular?" para no volver a preguntarla cada vez (sigue siendo editable).
  if (data.kr === 'materiales' && data.incluyeCelular !== null) {
    await updateIncluyeCelularConfig(data.marcaId, data.incluyeCelular);
  }

  return {
    id: cargaId,
    marcaId: data.marcaId,
    kr: data.kr,
    periodo: data.periodo,
    universo: preview.universoUsado,
    universoFuente: preview.universoFuente,
    cumplieron: preview.cumplieron,
    porcentaje: preview.porcentaje,
    respondieron: preview.respondieron,
    usuariosNoEncontrados: preview.usuariosNoEncontrados,
    diagnostico: preview.diagnostico,
    incluyeCelular: data.incluyeCelular,
    archivoNombre: data.archivoNombre,
    cargadoEn: new Date(rows[0].cargado_en as string).toISOString(),
  };
}

/**
 * Config de la cuenta: si ya se sabe que incluye celular (Materiales), su
 * umbral de % de respuesta (80% si nunca se ha tocado), y su headcount (uno
 * solo, aplica por default a los 3 KR — null si la cuenta no tiene headcount
 * capturado). Todo esto NO está periodizado: es un dato vigente de la
 * cuenta, igual en cualquier mes que se consulte. Los 3 KPI de captura manual
 * del OKR oficial (Contrato firmado, Alta ante el IMSS, Módulos publicados)
 * SÍ están periodizados — ver `fetchKpiManual`.
 */
export async function fetchConfig(marcaId: string): Promise<{
  incluyeCelular: boolean | null;
  umbralRespuesta: number;
  headcountManual: number | null;
}> {
  const { rows } = await sql.query(
    `select incluye_celular, umbral_respuesta, headcount_manual
     from emetrix_ponderacion_config where marca_id = $1`,
    [marcaId]
  );
  if (!rows[0]) return { incluyeCelular: null, umbralRespuesta: UMBRAL_RESPUESTA_DEFAULT, headcountManual: null };
  return {
    incluyeCelular: rows[0].incluye_celular as boolean | null,
    umbralRespuesta: rows[0].umbral_respuesta !== null ? Number(rows[0].umbral_respuesta) : UMBRAL_RESPUESTA_DEFAULT,
    headcountManual: rows[0].headcount_manual !== null ? Number(rows[0].headcount_manual) : null,
  };
}

export async function updateIncluyeCelularConfig(marcaId: string, incluyeCelular: boolean): Promise<void> {
  await sql.query(
    `insert into emetrix_ponderacion_config (marca_id, incluye_celular)
     values ($1, $2)
     on conflict (marca_id) do update set incluye_celular = excluded.incluye_celular`,
    [marcaId, incluyeCelular]
  );
}

/** Cambia el umbral mínimo de % de respuesta (0-100) por debajo del cual un KR se marca en alerta. 80% por default. */
export async function updateUmbralRespuesta(marcaId: string, umbralRespuesta: number): Promise<void> {
  await sql.query(
    `insert into emetrix_ponderacion_config (marca_id, umbral_respuesta)
     values ($1, $2)
     on conflict (marca_id) do update set umbral_respuesta = excluded.umbral_respuesta`,
    [marcaId, umbralRespuesta]
  );
}

/** Cambia el headcount de la cuenta (uno solo, aplica por default a los 3 KR). null para borrarlo (vuelve a "sin headcount de cuenta"). */
export async function updateHeadcountManual(marcaId: string, headcountManual: number | null): Promise<void> {
  await sql.query(
    `insert into emetrix_ponderacion_config (marca_id, headcount_manual)
     values ($1, $2)
     on conflict (marca_id) do update set headcount_manual = excluded.headcount_manual`,
    [marcaId, headcountManual]
  );
}

/**
 * Los 3 KPI de captura manual del OKR oficial (Contrato firmado, Alta ante
 * el IMSS, Módulos publicados en Emetrix) DE UN PERIODO — un indicador es de
 * una cuenta y un mes, igual que los de sondeo. Cada uno trae su
 * numerador/denominador de ESTE periodo (ambos null = pendiente de captura
 * ese mes, no cuenta como 0%, ver `construirArbolOkr`) y, como respaldo, el %
 * capturado con el formato anterior a la captura con base (`legacyPorcentaje`,
 * columnas `_manual` — se sigue leyendo para no perder ninguna cuenta que ya
 * lo hubiera capturado así, pero ya no se escribe).
 */
export async function fetchKpiManual(
  marcaId: string,
  periodo: string
): Promise<{ contratoFirmado: EmetrixKpiManualBase; imss: EmetrixKpiManualBase; modulosPublicados: EmetrixKpiManualBase }> {
  const { rows } = await sql.query(
    `select contrato_firmados_antes, contrato_nuevos_ingresos, contrato_firmado_manual,
            imss_altas_antes, imss_nuevos_ingresos, imss_manual,
            modulos_publicados_count, modulos_programados_count, modulos_publicados_manual
     from emetrix_ponderacion_kpi_manual where marca_id = $1 and periodo = $2`,
    [marcaId, periodo]
  );
  const num = (v: unknown): number | null => (v !== null && v !== undefined ? Number(v) : null);
  const r = rows[0];
  if (!r) {
    const vacio: EmetrixKpiManualBase = { numerador: null, denominador: null, legacyPorcentaje: null };
    return { contratoFirmado: { ...vacio }, imss: { ...vacio }, modulosPublicados: { ...vacio } };
  }
  return {
    contratoFirmado: { numerador: num(r.contrato_firmados_antes), denominador: num(r.contrato_nuevos_ingresos), legacyPorcentaje: num(r.contrato_firmado_manual) },
    imss: { numerador: num(r.imss_altas_antes), denominador: num(r.imss_nuevos_ingresos), legacyPorcentaje: num(r.imss_manual) },
    modulosPublicados: { numerador: num(r.modulos_publicados_count), denominador: num(r.modulos_programados_count), legacyPorcentaje: num(r.modulos_publicados_manual) },
  };
}

/** KPI "Contrato firmado" (KR1, dueño Legal) del OKR oficial, DE UN PERIODO — captura con base: "firmados antes del ingreso" (numerador) de "nuevos ingresos del mes" (denominador). null en cualquiera de los dos borra la captura de ese mes (vuelve a pendiente). */
export async function updateContratoFirmadoManual(marcaId: string, periodo: string, firmadosAntes: number | null, nuevosIngresos: number | null): Promise<void> {
  const error = validarBaseManual(firmadosAntes, nuevosIngresos);
  if (error) throw new Error(error);
  await sql.query(
    `insert into emetrix_ponderacion_kpi_manual (marca_id, periodo, contrato_firmados_antes, contrato_nuevos_ingresos)
     values ($1, $2, $3, $4)
     on conflict (marca_id, periodo) do update set
       contrato_firmados_antes = excluded.contrato_firmados_antes,
       contrato_nuevos_ingresos = excluded.contrato_nuevos_ingresos`,
    [marcaId, periodo, firmadosAntes, nuevosIngresos]
  );
}

/** KPI "Alta ante el IMSS" (KR1, dueño Nómina) del OKR oficial, DE UN PERIODO — captura con base: "altas antes del ingreso" (numerador) de "nuevos ingresos del mes" (denominador). null en cualquiera de los dos borra la captura de ese mes (vuelve a pendiente). */
export async function updateImssManual(marcaId: string, periodo: string, altasAntes: number | null, nuevosIngresos: number | null): Promise<void> {
  const error = validarBaseManual(altasAntes, nuevosIngresos);
  if (error) throw new Error(error);
  await sql.query(
    `insert into emetrix_ponderacion_kpi_manual (marca_id, periodo, imss_altas_antes, imss_nuevos_ingresos)
     values ($1, $2, $3, $4)
     on conflict (marca_id, periodo) do update set
       imss_altas_antes = excluded.imss_altas_antes,
       imss_nuevos_ingresos = excluded.imss_nuevos_ingresos`,
    [marcaId, periodo, altasAntes, nuevosIngresos]
  );
}

/** KPI "Módulos publicados en Emetrix" (KR3, dueño Capacitación) del OKR oficial, DE UN PERIODO — captura con base: "publicados" (numerador) de "programados a la fecha" (denominador). null en cualquiera de los dos borra la captura de ese mes (vuelve a pendiente). */
export async function updateModulosPublicadosManual(marcaId: string, periodo: string, publicados: number | null, programados: number | null): Promise<void> {
  const error = validarBaseManual(publicados, programados);
  if (error) throw new Error(error);
  await sql.query(
    `insert into emetrix_ponderacion_kpi_manual (marca_id, periodo, modulos_publicados_count, modulos_programados_count)
     values ($1, $2, $3, $4)
     on conflict (marca_id, periodo) do update set
       modulos_publicados_count = excluded.modulos_publicados_count,
       modulos_programados_count = excluded.modulos_programados_count`,
    [marcaId, periodo, publicados, programados]
  );
}

/** Detalle por promotor de la carga MÁS RECIENTE de un KR, EN ESE PERIODO, para una cuenta. null si ese KR no tiene ninguna carga en ese periodo todavía. */
export async function fetchDetalleCarga(
  marcaId: string,
  kr: EmetrixKr,
  periodo: string
): Promise<{
  cargaId: string;
  cargadoEn: string;
  universoFuente: EmetrixUniversoFuente;
  usuariosNoEncontrados: string[];
  filas: EmetrixFilaDetalle[];
  preguntas: EmetrixPreguntaResumen[];
} | null> {
  const { rows: cargaRows } = await sql.query(
    `select id, cargado_en, universo_fuente, usuarios_no_encontrados, preguntas_resumen from emetrix_ponderacion_cargas
     where marca_id = $1 and kr = $2 and periodo = $3 order by cargado_en desc limit 1`,
    [marcaId, kr, periodo]
  );
  const carga = cargaRows[0];
  if (!carga) return null;

  const { rows: detalleRows } = await sql.query(
    `select usuario, posicion, estado, detalle_falla from emetrix_ponderacion_detalle where carga_id = $1 order by usuario`,
    [carga.id]
  );

  return {
    cargaId: carga.id as string,
    cargadoEn: new Date(carga.cargado_en as string).toISOString(),
    universoFuente: carga.universo_fuente as EmetrixUniversoFuente,
    usuariosNoEncontrados: (carga.usuarios_no_encontrados as string[] | null) ?? [],
    preguntas: Array.isArray(carga.preguntas_resumen) ? (carga.preguntas_resumen as EmetrixPreguntaResumen[]) : [],
    filas: detalleRows.map((r) => ({
      promotorId: null,
      usuario: r.usuario as string,
      posicion: (r.posicion as string | null) ?? '',
      estado: r.estado as EmetrixEstado,
      detalleFalla: (r.detalle_falla as string | null) ?? null,
    })),
  };
}

/** Resultado por cuenta EN UN PERIODO: la carga más reciente de cada KR en ese periodo + su peso (33.3% default), con el total ponderado. */
export async function fetchResultadoCuenta(marcaId: string, periodo: string): Promise<EmetrixResultadoCuenta> {
  const [{ rows: marcaRows }, { rows: cargaRows }, { rows: pesoRows }, config] = await Promise.all([
    sql.query('select nombre from marcas where id = $1', [marcaId]),
    sql.query(
      `select distinct on (kr) kr, universo, universo_fuente, cumplieron, porcentaje, respondieron, cargado_en
       from emetrix_ponderacion_cargas
       where marca_id = $1 and periodo = $2
       order by kr, cargado_en desc`,
      [marcaId, periodo]
    ),
    sql.query('select kr, peso from emetrix_ponderacion_pesos where marca_id = $1', [marcaId]),
    fetchConfig(marcaId),
  ]);

  const marcaNombre = (marcaRows[0]?.nombre as string | undefined) ?? '';
  const pesoPorKr = new Map<EmetrixKr, number>(pesoRows.map((r) => [r.kr as EmetrixKr, Number(r.peso)]));
  const cargaPorKr = new Map(cargaRows.map((r) => [r.kr as EmetrixKr, r]));

  const KRS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
  const krs = KRS.map((kr) => {
    const carga = cargaPorKr.get(kr);
    const peso = pesoPorKr.get(kr) ?? PESO_DEFAULT[kr];
    if (!carga) {
      return {
        kr,
        universo: null,
        cumplieron: null,
        porcentaje: null,
        universoFuente: null,
        respondieron: null,
        porcentajeRespuesta: null,
        enAlerta: false,
        peso,
        aportacion: 0,
        cargadoEn: null,
      };
    }
    const universo = carga.universo !== null ? Number(carga.universo) : null;
    const respondieron = carga.respondieron !== null ? Number(carga.respondieron) : null;
    const porcentaje = Number(carga.porcentaje);
    const porcentajeRespuesta = calcularPorcentajeRespuesta(universo, respondieron);
    return {
      kr,
      universo,
      cumplieron: Number(carga.cumplieron),
      porcentaje,
      universoFuente: carga.universo_fuente as EmetrixUniversoFuente,
      respondieron,
      porcentajeRespuesta,
      enAlerta: porcentajeRespuesta === null || porcentajeRespuesta < config.umbralRespuesta,
      peso,
      aportacion: Math.round(((porcentaje * peso) / 100) * 100) / 100,
      cargadoEn: new Date(carga.cargado_en as string).toISOString(),
    };
  });

  return {
    marcaId,
    marcaNombre,
    periodo,
    krs,
    total: calcularTotalPonderado(krs),
    umbralRespuesta: config.umbralRespuesta,
    enAlerta: krs.some((k) => k.enAlerta),
  };
}

/** Historial de cargas de UN periodo, más reciente primero. Filtrable por cuenta. */
export async function fetchHistorial(periodo: string, marcaId?: string): Promise<EmetrixCarga[]> {
  const params: unknown[] = [periodo];
  let where = 'where c.periodo = $1';
  if (marcaId) {
    params.push(marcaId);
    where += ` and c.marca_id = $${params.length}`;
  }
  const { rows } = await sql.query(
    `select c.id, c.marca_id, m.nombre as marca_nombre, c.kr, c.periodo, c.universo, c.universo_fuente, c.cumplieron,
            c.porcentaje, c.respondieron, c.usuarios_no_encontrados, c.filas_leidas, c.filas_sin_usuario,
            c.filas_duplicadas, c.filas_envios_vacios, c.incluye_celular, c.archivo_nombre, c.cargado_en, u.nombre as cargado_por_nombre
     from emetrix_ponderacion_cargas c
     join marcas m on m.id = c.marca_id
     left join usuarios u on u.id = c.cargado_por
     ${where}
     order by c.cargado_en desc
     limit 200`,
    params
  );
  return rows.map((r) => ({
    id: r.id as string,
    marcaId: r.marca_id as string,
    marcaNombre: r.marca_nombre as string,
    kr: r.kr as EmetrixKr,
    periodo: r.periodo as string,
    universo: r.universo !== null ? Number(r.universo) : null,
    universoFuente: r.universo_fuente as EmetrixUniversoFuente,
    cumplieron: Number(r.cumplieron),
    porcentaje: Number(r.porcentaje),
    respondieron: r.respondieron !== null ? Number(r.respondieron) : null,
    usuariosNoEncontrados: (r.usuarios_no_encontrados as string[] | null) ?? [],
    diagnostico: {
      filasLeidas: Number(r.filas_leidas ?? 0),
      filasSinUsuario: Number(r.filas_sin_usuario ?? 0),
      filasDuplicadas: Number(r.filas_duplicadas ?? 0),
      enviosVacios: Number(r.filas_envios_vacios ?? 0),
      formatoLargo: null,
      columnaUsuario: null,
    },
    incluyeCelular: r.incluye_celular as boolean | null,
    archivoNombre: r.archivo_nombre as string | null,
    cargadoPorNombre: (r.cargado_por_nombre as string | null) ?? null,
    cargadoEn: new Date(r.cargado_en as string).toISOString(),
  }));
}

/**
 * Árbol OKR → KR → KPI de una cuenta para UN periodo, espejo exacto del OKR
 * oficial "Ciclo de vida del promotor". Solo obtiene los datos (la carga más
 * reciente de Materiales/Marca/Mesa de Control EN ESE PERIODO, y los 3 KPI
 * de captura manual DE ESE MISMO PERIODO) y delega todo el cálculo a
 * `construirArbolOkr` (lib/emetrix-ponderacion-calc.ts).
 */
export async function fetchResultadoOkrCuenta(marcaId: string, periodo: string): Promise<EmetrixOkrResultadoCuenta> {
  const [resultado, mesaControlDetalle, kpiManual, config] = await Promise.all([
    fetchResultadoCuenta(marcaId, periodo),
    fetchDetalleCarga(marcaId, 'mesa_control', periodo),
    fetchKpiManual(marcaId, periodo),
    fetchConfig(marcaId),
  ]);

  const materialesKr = resultado.krs.find((k) => k.kr === 'materiales');
  const marcaKr = resultado.krs.find((k) => k.kr === 'marca');

  const raiz = construirArbolOkr({
    materiales:
      materialesKr && materialesKr.porcentaje !== null && materialesKr.cumplieron !== null && materialesKr.respondieron !== null
        ? { cumplieron: materialesKr.cumplieron, respondieron: materialesKr.respondieron, porcentaje: materialesKr.porcentaje }
        : null,
    marca:
      marcaKr && marcaKr.porcentaje !== null && marcaKr.cumplieron !== null && marcaKr.respondieron !== null
        ? { cumplieron: marcaKr.cumplieron, respondieron: marcaKr.respondieron, porcentaje: marcaKr.porcentaje }
        : null,
    mesaControlPreguntas: mesaControlDetalle?.preguntas ?? null,
    contratoFirmado: kpiManual.contratoFirmado,
    imss: kpiManual.imss,
    modulosPublicados: kpiManual.modulosPublicados,
  });

  return {
    marcaId,
    marcaNombre: resultado.marcaNombre,
    periodo,
    headcountManual: config.headcountManual,
    umbralRespuesta: resultado.umbralRespuesta,
    enAlerta: resultado.enAlerta,
    sondeosCargadoEn: {
      mesa_control: resultado.krs.find((k) => k.kr === 'mesa_control')?.cargadoEn ?? null,
      materiales: resultado.krs.find((k) => k.kr === 'materiales')?.cargadoEn ?? null,
      marca: resultado.krs.find((k) => k.kr === 'marca')?.cargadoEn ?? null,
    },
    kpiManualBase: kpiManual,
    raiz,
  };
}

/**
 * El árbol OKR, EN UN PERIODO, de TODAS las cuentas registradas — incluye
 * las que todavía no tienen ninguna carga ese mes (quedan "sin-medir" en
 * todo el árbol), para poder verlas en "Cómo va cada cuenta" y
 * "Pendientes de indicador" (sección 10 de la ficha técnica).
 */
export async function fetchResultadoOkrTodasCuentas(periodo: string): Promise<EmetrixOkrResultadoCuenta[]> {
  const { rows } = await sql.query('select id, nombre from marcas order by nombre');
  return Promise.all(rows.map((r) => fetchResultadoOkrCuenta(r.id as string, periodo)));
}
