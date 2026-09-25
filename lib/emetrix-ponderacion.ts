// "Plan B": calculadora de ponderación de los sondeos de Emetrix
// (/emetrix-ponderacion, solo gerente) — respaldo manual mientras se
// resuelve la integración automática con Evolve OS. Parseo tolerante a
// espacios/mayúsculas en los nombres de columna (los archivos reales de
// Emetrix traen inconsistencias: "POSICION" vs "POSICION ", etc.).

import { sql } from '@vercel/postgres';
import type { EmetrixCarga, EmetrixFilaDetalle, EmetrixKr, EmetrixResultadoCuenta } from './types';

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
 * Si un promotor (USUARIO) aparece más de una vez, se usa su respuesta más
 * reciente — se asume que el archivo viene en orden cronológico, así que la
 * última aparición gana. Filas sin USUARIO se descartan (no cuentan en el
 * universo). Si el archivo no trae columna USUARIO, no se puede deduplicar
 * y se devuelve tal cual (validarColumnas ya habría fallado antes de esto).
 */
function deduplicarPorUsuario(headers: string[], rows: string[][]): string[][] {
  const idxUsuario = indiceColumna(headers, 'USUARIO');
  if (idxUsuario === -1) return rows;
  const porUsuario = new Map<string, string[]>();
  for (const row of rows) {
    const usuario = normalizar(row[idxUsuario] ?? '');
    if (!usuario) continue;
    porUsuario.set(usuario, row);
  }
  return [...porUsuario.values()];
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

/** Cumple = SI en las 4 preguntas de fondo. "Quién te acompañó" es solo informativo, no califica. */
export function calcularMesaControl(headers: string[], rows: string[][]): { filas: EmetrixFilaDetalle[]; cumplieron: number } {
  validarColumnas(headers, MESA_CONTROL_COLUMNAS, 'Mesa de Control');
  const valor = crearLector(headers);
  const filasUnicas = deduplicarPorUsuario(headers, rows);

  const filas = filasUnicas.map((row) => {
    const checks = [
      { label: 'Entrada a tienda', ok: esSi(valor(row, '¿Pudiste entrar a tu tienda el primer día?')) },
      { label: 'Emetrix funcionó', ok: esSi(valor(row, '¿Tu usuario Emetrix funciono cuando lo necesitaste?')) },
      { label: 'Te explicaron las marcas', ok: esSi(valor(row, '¿Te explicaron que marcas y productos atender?')) },
      { label: 'Recibiste saldo', ok: esSi(valor(row, '¿Ya recibiste tu saldo?')) },
    ];
    const cumple = checks.every((c) => c.ok);
    return {
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      cumple,
      detalleFalla: cumple ? null : `Faltan: ${checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}`,
    };
  });

  return { filas, cumplieron: filas.filter((f) => f.cumple).length };
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
export function calcularMateriales(
  headers: string[],
  rows: string[][],
  incluyeCelular: boolean
): { filas: EmetrixFilaDetalle[]; cumplieron: number } {
  validarColumnas(headers, MATERIALES_COLUMNAS_BASE, 'Materiales');
  const valor = crearLector(headers);
  const filasUnicas = deduplicarPorUsuario(headers, rows);

  const filas = filasUnicas.map((row) => {
    const checks = PRENDAS_OBLIGATORIAS.map((col) => ({ label: col, ok: esSi(valor(row, col)) }));
    if (incluyeCelular) {
      checks.push({ label: 'Celular de trabajo', ok: esSi(valor(row, '¿Ya recibiste tu celular de trabajo?')) });
      checks.push({ label: 'Emetrix instalado', ok: esSi(valor(row, '¿Tienes Emetrix instalado y funcionando con tu usuario?')) });
    }
    const cumple = checks.every((c) => c.ok);
    return {
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      cumple,
      detalleFalla: cumple ? null : `Faltan: ${checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}`,
    };
  });

  return { filas, cumplieron: filas.filter((f) => f.cumple).length };
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
export function calcularMarca(headers: string[], rows: string[][]): { filas: EmetrixFilaDetalle[]; cumplieron: number } {
  validarColumnas(headers, MARCA_COLUMNAS, 'Marca');
  const valor = crearLector(headers);
  const filasUnicas = deduplicarPorUsuario(headers, rows);

  const filas = filasUnicas.map((row) => {
    const aciertos = MARCA_PREGUNTAS.reduce((total, p) => {
      const respuesta = valor(row, p.columna);
      const acierto = p.modo === 'contiene' ? contieneOpcion(respuesta, p.esperado) : esExacto(respuesta, p.esperado);
      return total + (acierto ? 1 : 0);
    }, 0);
    const cumple = aciertos >= 8;
    return {
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      cumple,
      detalleFalla: cumple ? null : `Tu Marca: ${aciertos}/10`,
    };
  });

  return { filas, cumplieron: filas.filter((f) => f.cumple).length };
}

// ---- Persistencia ----

const PESO_DEFAULT = 33.3;

export async function guardarCarga(data: {
  marcaId: string;
  kr: EmetrixKr;
  totalFilas: number;
  universoManual: number | null;
  cumplieron: number;
  incluyeCelular: boolean | null;
  archivoNombre: string;
  cargadoPor: string;
  filas: EmetrixFilaDetalle[];
}): Promise<EmetrixCarga> {
  const universo = data.universoManual ?? data.totalFilas;
  const universoEsManual = data.universoManual !== null;
  const porcentaje = universo > 0 ? Math.round((data.cumplieron / universo) * 10000) / 100 : 0;

  const { rows } = await sql.query(
    `insert into emetrix_ponderacion_cargas
       (marca_id, kr, universo, universo_manual, cumplieron, porcentaje, incluye_celular, archivo_nombre, cargado_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, cargado_en`,
    [data.marcaId, data.kr, universo, universoEsManual, data.cumplieron, porcentaje, data.incluyeCelular, data.archivoNombre, data.cargadoPor]
  );
  const cargaId = rows[0].id as string;

  for (const f of data.filas) {
    await sql.query(
      `insert into emetrix_ponderacion_detalle (carga_id, usuario, posicion, cumple, detalle_falla) values ($1, $2, $3, $4, $5)`,
      [cargaId, f.usuario, f.posicion, f.cumple, f.detalleFalla]
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
    universo,
    universoManual: universoEsManual,
    cumplieron: data.cumplieron,
    porcentaje,
    incluyeCelular: data.incluyeCelular,
    archivoNombre: data.archivoNombre,
    cargadoEn: new Date(rows[0].cargado_en as string).toISOString(),
  };
}

/** Si la cuenta ya tiene guardado si incluye celular, para no volver a preguntarlo cada vez. null si nunca se ha guardado. */
export async function fetchIncluyeCelularConfig(marcaId: string): Promise<boolean | null> {
  const { rows } = await sql.query('select incluye_celular from emetrix_ponderacion_config where marca_id = $1', [marcaId]);
  return rows[0] ? (rows[0].incluye_celular as boolean | null) : null;
}

export async function updateIncluyeCelularConfig(marcaId: string, incluyeCelular: boolean): Promise<void> {
  await sql.query(
    `insert into emetrix_ponderacion_config (marca_id, incluye_celular)
     values ($1, $2)
     on conflict (marca_id) do update set incluye_celular = excluded.incluye_celular`,
    [marcaId, incluyeCelular]
  );
}

/** Detalle por promotor de la carga MÁS RECIENTE de un KR para una cuenta. null si ese KR no tiene ninguna carga todavía. */
export async function fetchDetalleCarga(
  marcaId: string,
  kr: EmetrixKr
): Promise<{ cargaId: string; cargadoEn: string; filas: EmetrixFilaDetalle[] } | null> {
  const { rows: cargaRows } = await sql.query(
    `select id, cargado_en from emetrix_ponderacion_cargas where marca_id = $1 and kr = $2 order by cargado_en desc limit 1`,
    [marcaId, kr]
  );
  const carga = cargaRows[0];
  if (!carga) return null;

  const { rows: detalleRows } = await sql.query(
    `select usuario, posicion, cumple, detalle_falla from emetrix_ponderacion_detalle where carga_id = $1 order by usuario`,
    [carga.id]
  );

  return {
    cargaId: carga.id as string,
    cargadoEn: new Date(carga.cargado_en as string).toISOString(),
    filas: detalleRows.map((r) => ({
      usuario: r.usuario as string,
      posicion: (r.posicion as string | null) ?? '',
      cumple: r.cumple as boolean,
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

/** Resultado por cuenta: la carga más reciente de cada KR + su peso (33.3% default), con el total ponderado. */
export async function fetchResultadoCuenta(marcaId: string): Promise<EmetrixResultadoCuenta> {
  const [{ rows: marcaRows }, { rows: cargaRows }, { rows: pesoRows }] = await Promise.all([
    sql.query('select nombre from marcas where id = $1', [marcaId]),
    sql.query(
      `select distinct on (kr) kr, universo, universo_manual, cumplieron, porcentaje, cargado_en
       from emetrix_ponderacion_cargas
       where marca_id = $1
       order by kr, cargado_en desc`,
      [marcaId]
    ),
    sql.query('select kr, peso from emetrix_ponderacion_pesos where marca_id = $1', [marcaId]),
  ]);

  const marcaNombre = (marcaRows[0]?.nombre as string | undefined) ?? '';
  const pesoPorKr = new Map<EmetrixKr, number>(pesoRows.map((r) => [r.kr as EmetrixKr, Number(r.peso)]));
  const cargaPorKr = new Map(cargaRows.map((r) => [r.kr as EmetrixKr, r]));

  const KRS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
  const krs = KRS.map((kr) => {
    const carga = cargaPorKr.get(kr);
    const peso = pesoPorKr.get(kr) ?? PESO_DEFAULT;
    if (!carga) {
      return { kr, universo: null, cumplieron: null, porcentaje: null, universoManual: null, peso, aportacion: 0, cargadoEn: null };
    }
    const porcentaje = Number(carga.porcentaje);
    return {
      kr,
      universo: Number(carga.universo),
      cumplieron: Number(carga.cumplieron),
      porcentaje,
      universoManual: carga.universo_manual as boolean,
      peso,
      aportacion: Math.round(((porcentaje * peso) / 100) * 100) / 100,
      cargadoEn: new Date(carga.cargado_en as string).toISOString(),
    };
  });

  return { marcaId, marcaNombre, krs, total: calcularTotalPonderado(krs) };
}

/** Resumen "Todas las cuentas": igual que fetchResultadoCuenta pero para cada cuenta que ya tiene al menos una carga. Las que no tienen ninguna quedan fuera. */
export async function fetchResultadoTodasCuentas(): Promise<EmetrixResultadoCuenta[]> {
  const [{ rows: cargaRows }, { rows: pesoRows }] = await Promise.all([
    sql.query(
      `select distinct on (c.marca_id, c.kr) c.marca_id, m.nombre as marca_nombre, c.kr, c.universo, c.universo_manual, c.cumplieron, c.porcentaje, c.cargado_en
       from emetrix_ponderacion_cargas c
       join marcas m on m.id = c.marca_id
       order by c.marca_id, c.kr, c.cargado_en desc`
    ),
    sql.query('select marca_id, kr, peso from emetrix_ponderacion_pesos'),
  ]);

  const pesoPorClave = new Map<string, number>(pesoRows.map((r) => [`${r.marca_id}:${r.kr}`, Number(r.peso)]));

  type Acumulado = { marcaId: string; marcaNombre: string; krs: Map<EmetrixKr, EmetrixResultadoCuenta['krs'][number]> };
  const porMarca = new Map<string, Acumulado>();
  for (const row of cargaRows) {
    const marcaId = row.marca_id as string;
    if (!porMarca.has(marcaId)) {
      porMarca.set(marcaId, { marcaId, marcaNombre: row.marca_nombre as string, krs: new Map() });
    }
    const kr = row.kr as EmetrixKr;
    const porcentaje = Number(row.porcentaje);
    const peso = pesoPorClave.get(`${marcaId}:${kr}`) ?? PESO_DEFAULT;
    porMarca.get(marcaId)!.krs.set(kr, {
      kr,
      universo: Number(row.universo),
      cumplieron: Number(row.cumplieron),
      porcentaje,
      universoManual: row.universo_manual as boolean,
      peso,
      aportacion: Math.round(((porcentaje * peso) / 100) * 100) / 100,
      cargadoEn: new Date(row.cargado_en as string).toISOString(),
    });
  }

  const KRS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
  const resultado: EmetrixResultadoCuenta[] = [];
  for (const { marcaId, marcaNombre, krs } of porMarca.values()) {
    const krsArr = KRS.map(
      (kr) =>
        krs.get(kr) ?? {
          kr,
          universo: null,
          cumplieron: null,
          porcentaje: null,
          universoManual: null,
          peso: pesoPorClave.get(`${marcaId}:${kr}`) ?? PESO_DEFAULT,
          aportacion: 0,
          cargadoEn: null,
        }
    );
    resultado.push({ marcaId, marcaNombre, krs: krsArr, total: calcularTotalPonderado(krsArr) });
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
    `select c.id, c.marca_id, m.nombre as marca_nombre, c.kr, c.universo, c.universo_manual, c.cumplieron,
            c.porcentaje, c.incluye_celular, c.archivo_nombre, c.cargado_en, u.nombre as cargado_por_nombre
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
    universo: Number(r.universo),
    universoManual: r.universo_manual as boolean,
    cumplieron: Number(r.cumplieron),
    porcentaje: Number(r.porcentaje),
    incluyeCelular: r.incluye_celular as boolean | null,
    archivoNombre: r.archivo_nombre as string | null,
    cargadoPorNombre: (r.cargado_por_nombre as string | null) ?? null,
    cargadoEn: new Date(r.cargado_en as string).toISOString(),
  }));
}
