// "Plan B": calculadora de ponderación de los sondeos de Emetrix
// (/emetrix-ponderacion, solo gerente) — respaldo manual mientras se
// resuelve la integración automática con Evolve OS. Parseo tolerante a
// espacios/mayúsculas/acentos en columnas y respuestas (los archivos reales
// de Emetrix traen inconsistencias: "POSICION" vs "POSICION ", "Sí"/"SI", etc.).
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

import { sql } from '@vercel/postgres';
import type {
  EmetrixCarga,
  EmetrixCargaPreview,
  EmetrixDiagnosticoArchivo,
  EmetrixEstado,
  EmetrixFilaDetalle,
  EmetrixKr,
  EmetrixPreguntaResumen,
  EmetrixResultadoCuenta,
  EmetrixResumenOkr,
  EmetrixResumenOkrFila,
  EmetrixUniversoFuente,
  EmetrixVistaCruzadaFila,
} from './types';

/** Trim + minúsculas + sin acentos/diacríticos, para comparar "SI"/"Sí"/"si" o "código"/"codigo" como iguales. */
function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function indiceColumna(headers: string[], nombre: string): number {
  const buscado = normalizar(nombre);
  return headers.findIndex((h) => normalizar(h) === buscado);
}

function crearLector(headers: string[]) {
  const cache = new Map<string, number>();
  return function valor(row: string[], nombreColumna: string): string {
    let idx = cache.get(nombreColumna);
    if (idx === undefined) {
      idx = indiceColumna(headers, nombreColumna);
      cache.set(nombreColumna, idx);
    }
    if (idx === -1) return '';
    return (row[idx] ?? '').trim();
  };
}

function esSi(valorCrudo: string): boolean {
  return normalizar(valorCrudo) === 'si';
}

/** Para preguntas de selección múltiple (valores separados por coma): ¿alguna de las opciones elegidas es exactamente la buscada? */
function contieneOpcion(valorCrudo: string, opcionBuscada: string): boolean {
  const objetivo = normalizar(opcionBuscada);
  return valorCrudo.split(',').some((parte) => normalizar(parte) === objetivo);
}

function esExacto(valorCrudo: string, esperado: string): boolean {
  return normalizar(valorCrudo) === normalizar(esperado);
}

/**
 * % de "Sí" de una pregunta Sí/No, sobre quienes contestaron esa pregunta con
 * "Sí" o "No" (ignora vacíos). `porcentaje` es null si NINGUNA fila trae un
 * valor reconocible en esa columna — probable indicio de que este archivo
 * redacta la pregunta o sus respuestas distinto a lo esperado; se reporta
 * así en vez de un 0% engañoso.
 */
function resumenPreguntaSiNo(valor: (row: string[], col: string) => string, filas: string[][], etiqueta: string, columna: string): EmetrixPreguntaResumen {
  let si = 0;
  let reconocidos = 0;
  for (const row of filas) {
    const raw = normalizar(valor(row, columna));
    if (raw === 'si') {
      si++;
      reconocidos++;
    } else if (raw === 'no') {
      reconocidos++;
    }
  }
  if (reconocidos === 0) return { pregunta: etiqueta, porcentaje: null, contestaron: 0 };
  return { pregunta: etiqueta, porcentaje: Math.round((si / reconocidos) * 10000) / 100, contestaron: reconocidos };
}

/**
 * % de respuesta correcta de una pregunta de opción múltiple (Tu Marca),
 * sobre quienes dejaron algo contestado (ignora vacíos). `porcentaje` es null
 * si nadie dejó respuesta en esa columna — probable indicio de que este
 * archivo redacta la pregunta distinto a lo esperado.
 */
function resumenPreguntaOpcion(
  valor: (row: string[], col: string) => string,
  filas: string[][],
  p: { columna: string; modo: 'contiene' | 'exacto'; esperado: string }
): EmetrixPreguntaResumen {
  let aciertos = 0;
  let contestaron = 0;
  for (const row of filas) {
    const raw = valor(row, p.columna);
    if (raw === '') continue;
    contestaron++;
    const acierto = p.modo === 'contiene' ? contieneOpcion(raw, p.esperado) : esExacto(raw, p.esperado);
    if (acierto) aciertos++;
  }
  if (contestaron === 0) return { pregunta: p.columna, porcentaje: null, contestaron: 0 };
  return { pregunta: p.columna, porcentaje: Math.round((aciertos / contestaron) * 10000) / 100, contestaron };
}

type FilasDeduplicadas = {
  filas: string[][];
  filasLeidas: number;
  filasSinUsuario: number;
  filasDuplicadas: number;
};

/**
 * Si un promotor (USUARIO) aparece más de una vez, se usa su respuesta más
 * reciente — se asume que el archivo viene en orden cronológico, así que la
 * última aparición gana. Filas sin USUARIO se descartan (no cuentan en el
 * universo). Si el archivo no trae columna USUARIO, no se puede deduplicar
 * y se devuelve tal cual (validarColumnas ya habría fallado antes de esto).
 */
function deduplicarPorUsuario(headers: string[], rows: string[][]): FilasDeduplicadas {
  const filasLeidas = rows.length;
  const idxUsuario = indiceColumna(headers, 'USUARIO');
  if (idxUsuario === -1) {
    return { filas: rows, filasLeidas, filasSinUsuario: 0, filasDuplicadas: 0 };
  }
  const porUsuario = new Map<string, string[]>();
  let filasSinUsuario = 0;
  let filasDuplicadas = 0;
  for (const row of rows) {
    const usuario = normalizar(row[idxUsuario] ?? '');
    if (!usuario) {
      filasSinUsuario++;
      continue;
    }
    if (porUsuario.has(usuario)) filasDuplicadas++;
    porUsuario.set(usuario, row);
  }
  return { filas: [...porUsuario.values()], filasLeidas, filasSinUsuario, filasDuplicadas };
}

export class ColumnasFaltantesError extends Error {}

function validarColumnas(headers: string[], requeridas: string[], nombreArchivo: string): void {
  const faltantes = requeridas.filter((r) => indiceColumna(headers, r) === -1);
  if (faltantes.length > 0) {
    throw new ColumnasFaltantesError(
      `Este archivo no parece ser el de "${nombreArchivo}" — faltan las columnas: ${faltantes.join(', ')}.`
    );
  }
}

type Calculo = { filas: EmetrixFilaDetalle[]; cumplieron: number; diagnostico: EmetrixDiagnosticoArchivo; preguntas: EmetrixPreguntaResumen[] };

// ---- Mesa de Control ----

const MESA_CONTROL_COLUMNAS = [
  'USUARIO',
  'POSICION',
  '¿Pudiste entrar a tu tienda el primer día?',
  '¿Tu usuario Emetrix funciono cuando lo necesitaste?',
  'El primer día, ¿Quién te acompaño a tienda?',
  '¿Te explicaron que marcas y productos atender?',
  '¿Ya recibiste tu saldo?',
];

const MESA_CONTROL_PREGUNTAS: Array<{ label: string; columna: string }> = [
  { label: 'Entrada a tienda', columna: '¿Pudiste entrar a tu tienda el primer día?' },
  { label: 'Emetrix funcionó', columna: '¿Tu usuario Emetrix funciono cuando lo necesitaste?' },
  { label: 'Te explicaron las marcas', columna: '¿Te explicaron que marcas y productos atender?' },
  { label: 'Recibiste saldo', columna: '¿Ya recibiste tu saldo?' },
];

/** Cumple = SI en las 4 preguntas de fondo. "Quién te acompañó" es solo informativo, no califica. */
export function calcularMesaControl(headers: string[], rows: string[][]): Calculo {
  validarColumnas(headers, MESA_CONTROL_COLUMNAS, 'Mesa de Control');
  const valor = crearLector(headers);
  const { filas: filasUnicas, filasLeidas, filasSinUsuario, filasDuplicadas } = deduplicarPorUsuario(headers, rows);

  const filas: EmetrixFilaDetalle[] = filasUnicas.map((row) => {
    const checks = MESA_CONTROL_PREGUNTAS.map((p) => ({ label: p.label, ok: esSi(valor(row, p.columna)) }));
    const cumple = checks.every((c) => c.ok);
    return {
      promotorId: null,
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      estado: cumple ? 'cumple' : 'no_cumple',
      detalleFalla: cumple ? null : `Faltan: ${checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}`,
    };
  });

  const preguntas = MESA_CONTROL_PREGUNTAS.map((p) => resumenPreguntaSiNo(valor, filasUnicas, p.label, p.columna));

  return {
    filas,
    cumplieron: filas.filter((f) => f.estado === 'cumple').length,
    diagnostico: { filasLeidas, filasSinUsuario, filasDuplicadas },
    preguntas,
  };
}

// ---- Materiales ----

const MATERIALES_COLUMNAS_BASE = [
  'USUARIO',
  'POSICION',
  'Uniforme',
  'Botas',
  'Faja',
  'Cintas',
  'Cortador y Navajas',
  'Franela',
  'Casco',
  'Lo que recibiste, ¿te quedó bien y está en buen estado?',
  '¿Firmaste de Recibido tus materiales?',
  '¿Ya recibiste tu celular de trabajo?',
  '¿Tienes Emetrix instalado y funcionando con tu usuario?',
  '¿Firmaste de recibido el equipo?',
];

const PRENDAS_OBLIGATORIAS = ['Uniforme', 'Botas', 'Faja', 'Cintas', 'Cortador y Navajas', 'Franela'];

/**
 * Cumple = SI en Uniforme/Botas/Faja/Cintas/Cortador y Navajas/Franela
 * (Casco no se exige). Si `incluyeCelular`, además exige celular +
 * Emetrix instalado; si no, esas dos preguntas se ignoran por completo.
 */
export function calcularMateriales(headers: string[], rows: string[][], incluyeCelular: boolean): Calculo {
  validarColumnas(headers, MATERIALES_COLUMNAS_BASE, 'Materiales');
  const valor = crearLector(headers);
  const { filas: filasUnicas, filasLeidas, filasSinUsuario, filasDuplicadas } = deduplicarPorUsuario(headers, rows);

  const filas: EmetrixFilaDetalle[] = filasUnicas.map((row) => {
    const checks = PRENDAS_OBLIGATORIAS.map((col) => ({ label: col, ok: esSi(valor(row, col)) }));
    if (incluyeCelular) {
      checks.push({ label: 'Celular de trabajo', ok: esSi(valor(row, '¿Ya recibiste tu celular de trabajo?')) });
      checks.push({ label: 'Emetrix instalado', ok: esSi(valor(row, '¿Tienes Emetrix instalado y funcionando con tu usuario?')) });
    }
    const cumple = checks.every((c) => c.ok);
    return {
      promotorId: null,
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      estado: cumple ? 'cumple' : 'no_cumple',
      detalleFalla: cumple ? null : `Faltan: ${checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}`,
    };
  });

  const preguntas = PRENDAS_OBLIGATORIAS.map((col) => resumenPreguntaSiNo(valor, filasUnicas, col, col));
  if (incluyeCelular) {
    preguntas.push(resumenPreguntaSiNo(valor, filasUnicas, 'Celular de trabajo', '¿Ya recibiste tu celular de trabajo?'));
    preguntas.push(resumenPreguntaSiNo(valor, filasUnicas, 'Emetrix instalado', '¿Tienes Emetrix instalado y funcionando con tu usuario?'));
  }

  return {
    filas,
    cumplieron: filas.filter((f) => f.estado === 'cumple').length,
    diagnostico: { filasLeidas, filasSinUsuario, filasDuplicadas },
    preguntas,
  };
}

// ---- Marca ----

const MARCA_PREGUNTAS: Array<{ columna: string; modo: 'contiene' | 'exacto'; esperado: string }> = [
  {
    columna: 'Un producto imperdible de tu cuenta no está en anaquel, pero hay piezas en bodega. ¿Qué haces?',
    modo: 'contiene',
    esperado: 'Lo surto de inmediato y lo registro en Emetrix',
  },
  { columna: 'Al surtir, ¿cómo acomodas el producto?', modo: 'contiene', esperado: 'Lo que caduca antes, al frente' },
  {
    columna: 'Encuentras en anaquel un producto de tu marca con el empaque golpeado o a punto de caducar. ¿Qué haces?',
    modo: 'contiene',
    esperado: 'Lo retiro y lo reporto como lo pide la tienda',
  },
  {
    columna: 'En bodega hay cajas sin acomodar y necesitas tu producto. ¿Cómo lo ubicas?',
    modo: 'contiene',
    esperado: 'Por el código o la descripción en la etiqueta de la caja',
  },
  {
    columna: 'Un producto de la competencia está ocupando el espacio de tu marca en el anaquel. ¿Qué haces?',
    modo: 'contiene',
    esperado: 'Lo reporto al encargado de piso y lo registro en Emetrix',
  },
  {
    columna: 'Según el planograma, la presentación grande va abajo, pero la encuentras arriba. ¿Qué haces?',
    modo: 'contiene',
    esperado: 'La acomodo según el planograma y lo registro',
  },
  { columna: 'El fleje dice $45 y en caja cobran $52. ¿Qué haces?', modo: 'contiene', esperado: 'Lo reporto al encargado y lo registro en Emetrix' },
  { columna: 'Un producto tiene 20 piezas en bodega y cero ventas en dos semanas. ¿Qué es?', modo: 'exacto', esperado: 'Venta cero' },
  {
    columna: '¿Cómo debe quedar el frente de tu producto en el anaquel?',
    modo: 'exacto',
    esperado: 'Al borde del anaquel, con la etiqueta hacia el cliente',
  },
  {
    columna: 'Te toca armar una exhibición adicional y te falta material POP. ¿Qué haces?',
    modo: 'contiene',
    esperado: 'La armo con lo que hay y reporto el faltante con foto en Emetrix',
  },
];

const MARCA_COLUMNAS = ['USUARIO', 'POSICION', ...MARCA_PREGUNTAS.map((p) => p.columna)];

/** Cumple = acierta 8 de 10 o más. */
export function calcularMarca(headers: string[], rows: string[][]): Calculo {
  validarColumnas(headers, MARCA_COLUMNAS, 'Marca');
  const valor = crearLector(headers);
  const { filas: filasUnicas, filasLeidas, filasSinUsuario, filasDuplicadas } = deduplicarPorUsuario(headers, rows);

  const filas: EmetrixFilaDetalle[] = filasUnicas.map((row) => {
    const aciertos = MARCA_PREGUNTAS.reduce((total, p) => {
      const respuesta = valor(row, p.columna);
      const acierto = p.modo === 'contiene' ? contieneOpcion(respuesta, p.esperado) : esExacto(respuesta, p.esperado);
      return total + (acierto ? 1 : 0);
    }, 0);
    const cumple = aciertos >= 8;
    return {
      promotorId: null,
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      estado: cumple ? 'cumple' : 'no_cumple',
      detalleFalla: cumple ? null : `Tu Marca: ${aciertos}/10`,
    };
  });

  const preguntas = MARCA_PREGUNTAS.map((p) => resumenPreguntaOpcion(valor, filasUnicas, p));

  return {
    filas,
    cumplieron: filas.filter((f) => f.estado === 'cumple').length,
    diagnostico: { filasLeidas, filasSinUsuario, filasDuplicadas },
    preguntas,
  };
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
 * % de respuesta (respondieron/universo, cobertura del sondeo) y % de
 * cumplimiento (cumplieron/respondieron, calidad SOLO entre quienes
 * contestaron) — separados a propósito: un universo con poca respuesta no
 * debe verse artificialmente mal o bien en el % de cumplimiento, se marca
 * aparte como "en alerta" (ver armarPreview). Sin universo (null), el % de
 * respuesta queda indefinido (null) — no hay con qué medir cobertura.
 */
function calcularPorcentajes(
  universo: number | null,
  respondieron: number,
  cumplieron: number
): { porcentaje: number; porcentajeRespuesta: number | null } {
  const porcentajeRespuesta = universo !== null && universo > 0 ? Math.round((respondieron / universo) * 10000) / 100 : universo === null ? null : 0;
  const porcentaje = respondieron > 0 ? Math.round((cumplieron / respondieron) * 10000) / 100 : 0;
  return { porcentaje, porcentajeRespuesta };
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

/** Vista cruzada por promotor: su estado en cada uno de los 3 KR (solo tiene sentido si la cuenta tiene padrón). */
export async function fetchVistaCruzada(marcaId: string): Promise<EmetrixVistaCruzadaFila[]> {
  const padron = await fetchPadronPorMarca(marcaId);
  if (padron.length === 0) return [];

  const KRS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
  const estadosPorKr = new Map<EmetrixKr, Map<string, EmetrixEstado>>();

  for (const kr of KRS) {
    const { rows: cargaRows } = await sql.query(
      `select id from emetrix_ponderacion_cargas
       where marca_id = $1 and kr = $2 and universo_fuente = 'padron'
       order by cargado_en desc limit 1`,
      [marcaId, kr]
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
// emetrix_ponderacion_pesos (todas, hoy). Al cambiar estos números, el nuevo
// valor se refleja de inmediato en las cargas ya guardadas, sin volver a
// subir ningún Excel — el peso no se guarda por carga, se resuelve al leer.
const PESO_DEFAULT: Record<EmetrixKr, number> = {
  mesa_control: 30,
  materiales: 40,
  marca: 30,
};
const UMBRAL_RESPUESTA_DEFAULT = 80;

export async function guardarCarga(data: {
  marcaId: string;
  kr: EmetrixKr;
  preview: EmetrixCargaPreview;
  incluyeCelular: boolean | null;
  archivoNombre: string;
  cargadoPor: string;
}): Promise<EmetrixCarga> {
  const { preview } = data;

  const { rows } = await sql.query(
    `insert into emetrix_ponderacion_cargas
       (marca_id, kr, universo, universo_fuente, cumplieron, porcentaje, respondieron, usuarios_no_encontrados,
        filas_leidas, filas_sin_usuario, filas_duplicadas, incluye_celular, archivo_nombre, cargado_por, preguntas_resumen)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
     returning id, cargado_en`,
    [
      data.marcaId,
      data.kr,
      preview.universoUsado,
      preview.universoFuente,
      preview.cumplieron,
      preview.porcentaje,
      preview.respondieron,
      preview.usuariosNoEncontrados,
      preview.diagnostico.filasLeidas,
      preview.diagnostico.filasSinUsuario,
      preview.diagnostico.filasDuplicadas,
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
 * umbral de % de respuesta (80% si nunca se ha tocado), y su headcount
 * (uno solo, aplica por default a los 3 KR — null si la cuenta no tiene
 * headcount capturado).
 */
export async function fetchConfig(marcaId: string): Promise<{ incluyeCelular: boolean | null; umbralRespuesta: number; headcountManual: number | null }> {
  const { rows } = await sql.query('select incluye_celular, umbral_respuesta, headcount_manual from emetrix_ponderacion_config where marca_id = $1', [
    marcaId,
  ]);
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

/** Detalle por promotor de la carga MÁS RECIENTE de un KR para una cuenta. null si ese KR no tiene ninguna carga todavía. */
export async function fetchDetalleCarga(
  marcaId: string,
  kr: EmetrixKr
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
     where marca_id = $1 and kr = $2 order by cargado_en desc limit 1`,
    [marcaId, kr]
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

/**
 * El % del OKR es el promedio ponderado SOLO de los KR que sí tienen carga
 * — un KR sin datos queda fuera de la cuenta (no cuenta como 0%, no castiga
 * el total). null si ningún KR tiene carga todavía.
 */
function calcularTotalPonderado(krs: EmetrixResultadoCuenta['krs']): number | null {
  const conDatos = krs.filter((k) => k.porcentaje !== null);
  const sumaPesos = conDatos.reduce((s, k) => s + k.peso, 0);
  if (conDatos.length === 0 || sumaPesos === 0) return null;
  const sumaPonderada = conDatos.reduce((s, k) => s + k.porcentaje! * k.peso, 0);
  return Math.round((sumaPonderada / sumaPesos) * 100) / 100;
}

/** null si no hay carga (sin datos todavía). Si hay carga pero nadie contestó, 0%. */
function calcularPorcentajeRespuesta(universo: number | null, respondieron: number | null): number | null {
  if (universo === null || respondieron === null) return null;
  return universo > 0 ? Math.round((respondieron / universo) * 10000) / 100 : 0;
}

/** Resultado por cuenta: la carga más reciente de cada KR + su peso (33.3% default), con el total ponderado. */
export async function fetchResultadoCuenta(marcaId: string): Promise<EmetrixResultadoCuenta> {
  const [{ rows: marcaRows }, { rows: cargaRows }, { rows: pesoRows }, config] = await Promise.all([
    sql.query('select nombre from marcas where id = $1', [marcaId]),
    sql.query(
      `select distinct on (kr) kr, universo, universo_fuente, cumplieron, porcentaje, respondieron, cargado_en
       from emetrix_ponderacion_cargas
       where marca_id = $1
       order by kr, cargado_en desc`,
      [marcaId]
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

  return { marcaId, marcaNombre, krs, total: calcularTotalPonderado(krs), umbralRespuesta: config.umbralRespuesta, enAlerta: krs.some((k) => k.enAlerta) };
}

/** Resumen "Todas las cuentas": igual que fetchResultadoCuenta pero para cada cuenta que ya tiene al menos una carga. Las que no tienen ninguna quedan fuera. */
export async function fetchResultadoTodasCuentas(): Promise<EmetrixResultadoCuenta[]> {
  const [{ rows: cargaRows }, { rows: pesoRows }, { rows: configRows }] = await Promise.all([
    sql.query(
      `select distinct on (c.marca_id, c.kr) c.marca_id, m.nombre as marca_nombre, c.kr, c.universo, c.universo_fuente,
              c.cumplieron, c.porcentaje, c.respondieron, c.cargado_en
       from emetrix_ponderacion_cargas c
       join marcas m on m.id = c.marca_id
       order by c.marca_id, c.kr, c.cargado_en desc`
    ),
    sql.query('select marca_id, kr, peso from emetrix_ponderacion_pesos'),
    sql.query('select marca_id, umbral_respuesta from emetrix_ponderacion_config'),
  ]);

  const pesoPorClave = new Map<string, number>(pesoRows.map((r) => [`${r.marca_id}:${r.kr}`, Number(r.peso)]));
  const umbralPorMarca = new Map<string, number>(
    configRows.map((r) => [r.marca_id as string, r.umbral_respuesta !== null ? Number(r.umbral_respuesta) : UMBRAL_RESPUESTA_DEFAULT])
  );

  type Acumulado = { marcaId: string; marcaNombre: string; krs: Map<EmetrixKr, EmetrixResultadoCuenta['krs'][number]> };
  const porMarca = new Map<string, Acumulado>();
  for (const row of cargaRows) {
    const marcaId = row.marca_id as string;
    if (!porMarca.has(marcaId)) {
      porMarca.set(marcaId, { marcaId, marcaNombre: row.marca_nombre as string, krs: new Map() });
    }
    const kr = row.kr as EmetrixKr;
    const universo = row.universo !== null ? Number(row.universo) : null;
    const respondieron = row.respondieron !== null ? Number(row.respondieron) : null;
    const porcentaje = Number(row.porcentaje);
    const porcentajeRespuesta = calcularPorcentajeRespuesta(universo, respondieron);
    const umbralRespuesta = umbralPorMarca.get(marcaId) ?? UMBRAL_RESPUESTA_DEFAULT;
    const peso = pesoPorClave.get(`${marcaId}:${kr}`) ?? PESO_DEFAULT[kr];
    porMarca.get(marcaId)!.krs.set(kr, {
      kr,
      universo,
      cumplieron: Number(row.cumplieron),
      porcentaje,
      universoFuente: row.universo_fuente as EmetrixUniversoFuente,
      respondieron,
      porcentajeRespuesta,
      enAlerta: porcentajeRespuesta === null || porcentajeRespuesta < umbralRespuesta,
      peso,
      aportacion: Math.round(((porcentaje * peso) / 100) * 100) / 100,
      cargadoEn: new Date(row.cargado_en as string).toISOString(),
    });
  }

  const KRS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
  const resultado: EmetrixResultadoCuenta[] = [];
  for (const { marcaId, marcaNombre, krs } of porMarca.values()) {
    const umbralRespuesta = umbralPorMarca.get(marcaId) ?? UMBRAL_RESPUESTA_DEFAULT;
    const krsArr = KRS.map(
      (kr) =>
        krs.get(kr) ?? {
          kr,
          universo: null,
          cumplieron: null,
          porcentaje: null,
          universoFuente: null,
          respondieron: null,
          porcentajeRespuesta: null,
          enAlerta: false,
          peso: pesoPorClave.get(`${marcaId}:${kr}`) ?? PESO_DEFAULT[kr],
          aportacion: 0,
          cargadoEn: null,
        }
    );
    resultado.push({ marcaId, marcaNombre, krs: krsArr, total: calcularTotalPonderado(krsArr), umbralRespuesta, enAlerta: krsArr.some((k) => k.enAlerta) });
  }

  resultado.sort((a, b) => a.marcaNombre.localeCompare(b.marcaNombre));
  return resultado;
}

export async function updatePesoKr(marcaId: string, kr: EmetrixKr, peso: number): Promise<void> {
  await sql.query(
    `insert into emetrix_ponderacion_pesos (marca_id, kr, peso)
     values ($1, $2, $3)
     on conflict (marca_id, kr) do update set peso = excluded.peso`,
    [marcaId, kr, peso]
  );
}

/** Historial de cargas, más reciente primero. Filtrable por cuenta. */
export async function fetchHistorial(marcaId?: string): Promise<EmetrixCarga[]> {
  const { rows } = await sql.query(
    `select c.id, c.marca_id, m.nombre as marca_nombre, c.kr, c.universo, c.universo_fuente, c.cumplieron,
            c.porcentaje, c.respondieron, c.usuarios_no_encontrados, c.filas_leidas, c.filas_sin_usuario,
            c.filas_duplicadas, c.incluye_celular, c.archivo_nombre, c.cargado_en, u.nombre as cargado_por_nombre
     from emetrix_ponderacion_cargas c
     join marcas m on m.id = c.marca_id
     left join usuarios u on u.id = c.cargado_por
     ${marcaId ? 'where c.marca_id = $1' : ''}
     order by c.cargado_en desc
     limit 200`,
    marcaId ? [marcaId] : []
  );
  return rows.map((r) => ({
    id: r.id as string,
    marcaId: r.marca_id as string,
    marcaNombre: r.marca_nombre as string,
    kr: r.kr as EmetrixKr,
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
    },
    incluyeCelular: r.incluye_celular as boolean | null,
    archivoNombre: r.archivo_nombre as string | null,
    cargadoPorNombre: (r.cargado_por_nombre as string | null) ?? null,
    cargadoEn: new Date(r.cargado_en as string).toISOString(),
  }));
}

/**
 * Resumen para el OKR "Ciclo de vida del promotor", por cuenta: traduce los
 * 3 KR del sondeo de Emetrix a las 5 métricas que pide el OKR oficial.
 * "Carta de acceso y credencial" y "Usuario en Emetrix" salen de dos
 * preguntas puntuales de Mesa de Control (no de su % de cumplimiento
 * general, que exige las 4 preguntas a la vez); "Materiales completos" y
 * "Módulo completado" son el % de cumplimiento tal cual de esos dos KR.
 * "Contrato e IMSS" no sale de este sondeo (viene del padrón/Aspel) — se
 * marca pendiente a propósito. `valor` de cada fila explica por qué no hay
 * número cuando `porcentaje` es null (falta cargar el sondeo, la pregunta no
 * se reconoció en este archivo, o es la fila fija de Contrato e IMSS).
 */
export async function fetchResumenOkr(marcaId: string): Promise<EmetrixResumenOkr> {
  const [resultado, mesaControlDetalle] = await Promise.all([fetchResultadoCuenta(marcaId), fetchDetalleCarga(marcaId, 'mesa_control')]);

  function filaDePregunta(etiqueta: string, labelPregunta: string): EmetrixResumenOkrFila {
    if (!mesaControlDetalle) return { etiqueta, valor: 'Falta cargar Mesa de Control', porcentaje: null };
    const p = mesaControlDetalle.preguntas.find((x) => x.pregunta === labelPregunta);
    if (!p || p.porcentaje === null) return { etiqueta, valor: 'Pregunta no reconocida en este archivo', porcentaje: null };
    return { etiqueta, valor: `${p.porcentaje}%`, porcentaje: p.porcentaje };
  }

  function filaDeKr(etiqueta: string, kr: EmetrixKr): EmetrixResumenOkrFila {
    const k = resultado.krs.find((x) => x.kr === kr);
    if (!k || k.porcentaje === null) return { etiqueta, valor: 'Falta cargar', porcentaje: null };
    return { etiqueta, valor: `${k.porcentaje}%`, porcentaje: k.porcentaje };
  }

  return {
    marcaId,
    marcaNombre: resultado.marcaNombre,
    filas: [
      filaDePregunta('Carta de acceso y credencial', 'Entrada a tienda'),
      filaDePregunta('Usuario en Emetrix', 'Emetrix funcionó'),
      filaDeKr('Materiales completos', 'materiales'),
      filaDeKr('Módulo completado (aproximación)', 'marca'),
      { etiqueta: 'Contrato e IMSS', valor: 'Pendiente (Legal / Nómina)', porcentaje: null },
    ],
  };
}
