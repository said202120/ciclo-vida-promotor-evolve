// "Plan B": calculadora de ponderación de los sondeos de Emetrix
// (/emetrix-ponderacion, solo gerente) — respaldo manual mientras se
// resuelve la integración automática con Evolve OS. Parseo tolerante a
// espacios/mayúsculas en los nombres de columna (los archivos reales de
// Emetrix traen inconsistencias: "POSICION" vs "POSICION ", etc.).

import { sql } from '@vercel/postgres';
import type { EmetrixCarga, EmetrixKr, EmetrixResultadoCuenta } from './types';

function normalizar(s: string): string {
  return s.trim().toLowerCase();
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
  return valorCrudo.trim().toUpperCase() === 'SI';
}

/** Para preguntas de selección múltiple (valores separados por coma): ¿alguna de las opciones elegidas es exactamente la buscada? */
function contieneOpcion(valorCrudo: string, opcionBuscada: string): boolean {
  const objetivo = normalizar(opcionBuscada);
  return valorCrudo.split(',').some((parte) => normalizar(parte) === objetivo);
}

function esExacto(valorCrudo: string, esperado: string): boolean {
  return normalizar(valorCrudo) === normalizar(esperado);
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

export type FilaMesaControl = {
  usuario: string;
  posicion: string;
  cumple: boolean;
  quienAcompano: string;
};

/** Cumple = SI en las 4 preguntas de fondo. "Quién te acompañó" es solo informativo, no califica. */
export function calcularMesaControl(headers: string[], rows: string[][]): { filas: FilaMesaControl[]; cumplieron: number } {
  validarColumnas(headers, MESA_CONTROL_COLUMNAS, 'Mesa de Control');
  const valor = crearLector(headers);

  const filas = rows.map((row) => {
    const entroTienda = esSi(valor(row, '¿Pudiste entrar a tu tienda el primer día?'));
    const emetrixFunciono = esSi(valor(row, '¿Tu usuario Emetrix funciono cuando lo necesitaste?'));
    const explicaronMarcas = esSi(valor(row, '¿Te explicaron que marcas y productos atender?'));
    const recibioSaldo = esSi(valor(row, '¿Ya recibiste tu saldo?'));
    return {
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      cumple: entroTienda && emetrixFunciono && explicaronMarcas && recibioSaldo,
      quienAcompano: valor(row, 'El primer día, ¿Quién te acompaño a tienda?'),
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

export type FilaMateriales = {
  usuario: string;
  posicion: string;
  cumple: boolean;
};

/**
 * Cumple = SI en Uniforme/Botas/Faja/Cintas/Cortador y Navajas/Franela
 * (Casco no se exige). Si `incluyeCelular`, además exige celular +
 * Emetrix instalado; si no, esas dos preguntas se ignoran por completo.
 */
export function calcularMateriales(
  headers: string[],
  rows: string[][],
  incluyeCelular: boolean
): { filas: FilaMateriales[]; cumplieron: number } {
  validarColumnas(headers, MATERIALES_COLUMNAS_BASE, 'Materiales');
  const valor = crearLector(headers);

  const filas = rows.map((row) => {
    const prendas = ['Uniforme', 'Botas', 'Faja', 'Cintas', 'Cortador y Navajas', 'Franela'].every((col) =>
      esSi(valor(row, col))
    );
    const celularOk = !incluyeCelular || (esSi(valor(row, '¿Ya recibiste tu celular de trabajo?')) && esSi(valor(row, '¿Tienes Emetrix instalado y funcionando con tu usuario?')));
    return {
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      cumple: prendas && celularOk,
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

export type FilaMarca = {
  usuario: string;
  posicion: string;
  aciertos: number;
  cumple: boolean;
};

/** Cumple = acierta 8 de 10 o más. */
export function calcularMarca(headers: string[], rows: string[][]): { filas: FilaMarca[]; cumplieron: number } {
  validarColumnas(headers, MARCA_COLUMNAS, 'Marca');
  const valor = crearLector(headers);

  const filas = rows.map((row) => {
    const aciertos = MARCA_PREGUNTAS.reduce((total, p) => {
      const respuesta = valor(row, p.columna);
      const acierto = p.modo === 'contiene' ? contieneOpcion(respuesta, p.esperado) : esExacto(respuesta, p.esperado);
      return total + (acierto ? 1 : 0);
    }, 0);
    return {
      usuario: valor(row, 'USUARIO'),
      posicion: valor(row, 'POSICION'),
      aciertos,
      cumple: aciertos >= 8,
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

  return {
    id: rows[0].id as string,
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
    if (!carga) return { kr, universo: null, cumplieron: null, porcentaje: null, peso, aportacion: 0, cargadoEn: null };
    const porcentaje = Number(carga.porcentaje);
    return {
      kr,
      universo: Number(carga.universo),
      cumplieron: Number(carga.cumplieron),
      porcentaje,
      peso,
      aportacion: Math.round(((porcentaje * peso) / 100) * 100) / 100,
      cargadoEn: new Date(carga.cargado_en as string).toISOString(),
    };
  });

  const total = Math.round(krs.reduce((sum, k) => sum + k.aportacion, 0) * 100) / 100;

  return { marcaId, marcaNombre, krs, total };
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
