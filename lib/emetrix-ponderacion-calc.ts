// Matemática pura de "Plan B" (calculadora de ponderación de los sondeos de
// Emetrix, /emetrix-ponderacion, solo gerente): parseo de archivos, reglas de
// cumple/no cumple de los 3 sondeos, y el árbol OKR → KR → KPI. Nada en este
// archivo toca la base de datos ni la pantalla — son las MISMAS funciones que
// usa la pantalla, la descarga en Excel y cualquier envío futuro (ver
// lib/emetrix-ponderacion.ts, que solo obtiene datos de la base y delega aquí
// el cálculo). Ver docs/ficha-tecnica-okr-ponderacion.md para la especificación
// completa, y lib/emetrix-ponderacion-calc.test.ts para las pruebas (corren
// con `node --test`, sin tocar la base).
//
// Periodo: cada carga pertenece a un mes, formato "YYYY-MM" (ej. "2026-09") —
// mismo formato que ya usa el resto de la app (ver /api/meses). Nunca se
// mezclan cargas de distintos periodos en un mismo cálculo.
//
// Indicador: el nivel más bajo del árbol OKR es el indicador = una cuenta × un
// KPI (o KR/OKR agregado) × un periodo. Siempre trae {estado, valor, base,
// motivo} (ver EmetrixIndicador en lib/types.ts) — un KPI pendiente nunca se
// disfraza de 0%, y un 0% medido (ej. Materiales en Hanes) nunca se disfraza
// de "sin-medir".

import { parseFlexibleDate } from './import-shared.ts';
import { OKR_OFICIAL } from './okr-oficial.ts';
import type {
  EmetrixDiagnosticoArchivo,
  EmetrixFilaDetalle,
  EmetrixIndicador,
  EmetrixKpiManualBase,
  EmetrixKr,
  EmetrixOkrNodo,
  EmetrixPreguntaResumen,
  OkrLecturaIndicador,
  OkrLecturaRespuesta,
} from './types';

// ---- Periodo ----

const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** true si `periodo` tiene la forma "YYYY-MM" (ej. "2026-09"). */
export function esPeriodoValido(periodo: string): boolean {
  return PERIODO_REGEX.test(periodo);
}

/** Periodo ("YYYY-MM") del mes actual — default al elegir periodo para una carga nueva. `ahora` es inyectable para pruebas. */
export function periodoActual(ahora: Date = new Date()): string {
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
}

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** "2026-09" -> "Septiembre 2026", para mostrar en el selector de periodo y en la descarga. */
export function formatPeriodoLabel(periodo: string): string {
  const [anio, mes] = periodo.split('-');
  const nombreMes = NOMBRES_MES[parseInt(mes, 10) - 1] ?? mes;
  return `${nombreMes} ${anio}`;
}

/** "2026-09" -> "2026-09-01" (primer día del mes, ISO) — para `periodo.inicio` de `GET /api/okr-resultados` (sección 4-quater). */
export function periodoInicioISO(periodo: string): string {
  return `${periodo}-01`;
}

// ---- Normalización de texto/columnas ----

/** Trim + minúsculas + sin acentos/diacríticos, para comparar "SI"/"Sí"/"si" o "código"/"codigo" como iguales. */
export function normalizar(s: string): string {
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

/** Lee la primera columna de `candidatos` que exista en el archivo (ej. "FECHA ENTRADA" o, si no, "FECHA DE ENTRADA"). '' si ninguna existe. */
function valorAlias(valor: (row: string[], col: string) => string, headers: string[], row: string[], candidatos: string[]): string {
  for (const candidato of candidatos) {
    if (indiceColumna(headers, candidato) !== -1) return valor(row, candidato);
  }
  return '';
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

/**
 * Para preguntas de selección múltiple (P2/P7 de Tu Marca): ¿el texto
 * completo de la opción correcta aparece DENTRO de la respuesta del
 * promotor (normalizado: sin mayúsculas, acentos ni espacios extra)? NO se
 * parte primero por coma — el texto de la opción correcta de P2 ("Lo que
 * caduca antes, al frente") trae una coma propia, así que partir a ciegas la
 * fragmentaba en dos pedazos que nunca calzaban con la opción completa en
 * cuanto el promotor marcaba esa opción JUNTO con otras (ej. "Lo de mejor
 * empaque al frente, Lo que caduca antes, al frente"), aunque sí la
 * reconocía cuando la marcaba sola. Comparar por substring evita ambos
 * casos sin depender de dónde caigan las comas de las DEMÁS opciones
 * elegidas.
 */
function contieneOpcion(valorCrudo: string, opcionBuscada: string): boolean {
  return normalizar(valorCrudo).includes(normalizar(opcionBuscada));
}

function esExacto(valorCrudo: string, esperado: string): boolean {
  return normalizar(valorCrudo) === normalizar(esperado);
}

/**
 * % de "Sí" de una pregunta Sí/No, sobre quienes contestaron esa pregunta con
 * "Sí" o "No" (ignora vacíos). `porcentaje` es null si NINGUNA fila trae un
 * valor reconocible en esa columna — probable indicio de que este archivo
 * redacta la pregunta o sus respuestas distinto a lo esperado; se reporta
 * así en vez de un 0% engañoso ("vacío no es cero").
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
  if (reconocidos === 0) return { pregunta: etiqueta, porcentaje: null, numerador: 0, contestaron: 0 };
  return { pregunta: etiqueta, porcentaje: Math.round((si / reconocidos) * 10000) / 100, numerador: si, contestaron: reconocidos };
}

/**
 * % de respuesta correcta de una pregunta de opción múltiple (Tu Marca),
 * sobre quienes dejaron algo contestado (ignora vacíos). `porcentaje` es null
 * si nadie dejó respuesta en esa columna — probable indicio de que este
 * archivo redacta la pregunta distinto a lo esperado ("vacío no es cero").
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
  if (contestaron === 0) return { pregunta: p.columna, porcentaje: null, numerador: 0, contestaron: 0 };
  return { pregunta: p.columna, porcentaje: Math.round((aciertos / contestaron) * 10000) / 100, numerador: aciertos, contestaron };
}

// ---- Columna USUARIO con otro nombre (ej. Hanes trae el código de promotor en "NOMBRE") ----

/** letras seguidas de números, sin espacios — ej. "HANPRO029". */
const PATRON_CODIGO_PROMOTOR = /^[A-Za-z]+[0-9]+$/;

/** Columnas que nunca se confunden con la de USUARIO, aunque su contenido calzara el patrón por casualidad. */
const COLUMNAS_NO_USUARIO = ['PREGUNTA', 'RESPUESTA', 'FECHA ENTRADA', 'FECHA DE ENTRADA', 'FECHA SALIDA', 'BOOL', 'POSICION'].map(normalizar);

/**
 * Si el archivo no trae una columna USUARIO, busca cuál otra columna (sin
 * importar cómo se llame — ej. Hanes usa "NOMBRE" para el código de
 * promotor, tipo "HANPRO029") tiene, en al menos 90% de sus valores no
 * vacíos, forma de código de promotor (letras seguidas de números, sin
 * espacios) y la renombra a "USUARIO" para que el resto del pipeline
 * (deduplicarPorUsuario, detectarYConvertirFormatoLargo, validarColumnas)
 * funcione exactamente igual que con un archivo que sí trae USUARIO. No hace
 * nada (regresa tal cual, sin nota) si el archivo ya trae USUARIO.
 */
export function normalizarColumnaUsuario(headers: string[], rows: string[][]): { headers: string[]; notaUsuario: string | null } {
  if (indiceColumna(headers, 'USUARIO') !== -1) return { headers, notaUsuario: null };

  let mejorIndice = -1;
  let mejorRatio = 0;
  for (let indice = 0; indice < headers.length; indice++) {
    if (COLUMNAS_NO_USUARIO.includes(normalizar(headers[indice]))) continue;
    const valores = rows.map((row) => (row[indice] ?? '').trim()).filter((v) => v !== '');
    if (valores.length === 0) continue;
    const ratio = valores.filter((v) => PATRON_CODIGO_PROMOTOR.test(v)).length / valores.length;
    if (ratio >= 0.9 && ratio > mejorRatio) {
      mejorIndice = indice;
      mejorRatio = ratio;
    }
  }

  if (mejorIndice === -1) return { headers, notaUsuario: null };
  const nuevosHeaders = [...headers];
  const columnaOriginal = headers[mejorIndice];
  nuevosHeaders[mejorIndice] = 'USUARIO';
  return {
    headers: nuevosHeaders,
    notaUsuario: `No se encontró columna USUARIO; se usó "${columnaOriginal}" (sus valores parecen código de promotor).`,
  };
}

// ---- Formato "largo" (una fila por respuesta, ej. ADM) ----

const MESES_ABREV: Record<string, number> = {
  ene: 1,
  jan: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};

/**
 * Parsea fechas con hora tipo "24/Sep/2026, 08:33am" (día/mes-abreviado/año,
 * hora 12h con am/pm — formato visto en el sondeo de Hanes). Acepta mes en
 * español o inglés (3+ letras, solo se usan las primeras 3), con o sin coma
 * antes de la hora, y la hora es opcional. Devuelve epoch ms, o null si no
 * coincide con este formato.
 */
function parseFechaConHora(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})\/([A-Za-zÀ-ÿ]{3,})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?)?$/i);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = MESES_ABREV[m[2].toLowerCase().slice(0, 3)];
  const anio = Number(m[3]);
  if (mes === undefined || dia < 1 || dia > 31) return null;
  let horas = 0;
  let minutos = 0;
  if (m[4]) {
    horas = Number(m[4]) % 12;
    minutos = Number(m[5]);
    if (m[6].toLowerCase() === 'p') horas += 12;
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, horas, minutos));
  return Number.isNaN(fecha.getTime()) ? null : fecha.getTime();
}

/**
 * Compara dos valores de FECHA ENTRADA de forma tolerante. Primero intenta
 * el formato con hora de 12h "DD/Mon/YYYY, hh:mmam" (`parseFechaConHora`) —
 * si ambos valores coinciden con ese formato, esa comparación manda (trae
 * hora exacta, la más confiable). Si no, intenta normalizar ambos a fecha
 * con `parseFlexibleDate` (acepta YYYY-MM-DD, DD/MM/YYYY o MM/DD/YYYY, y
 * seriales de Excel); si ambos se pudieron parsear y son distintos, ese
 * resultado manda. Si empatan (mismo día) o alguno no se pudo parsear con
 * ningún método, se usa el texto crudo completo como desempate — esto
 * conserva la hora del día si el archivo la trae en un formato no
 * reconocido explícitamente.
 */
function compararFechaEntrada(a: string, b: string): number {
  const ha = parseFechaConHora(a);
  const hb = parseFechaConHora(b);
  if (ha !== null && hb !== null) return ha - hb;
  const pa = parseFlexibleDate(a);
  const pb = parseFlexibleDate(b);
  if (pa !== null && pb !== null && pa !== pb) return pa < pb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * ¿`candidato` debe reemplazar a `actual` como el envío más reciente de un
 * (usuario, pregunta)? Un envío sin ninguna respuesta ("vacío no es cero")
 * nunca le gana a uno con respuesta, sin importar su fecha — así una visita
 * posterior en la que el promotor no contestó ESA pregunta no borra la
 * respuesta real de una visita anterior. Entre dos envíos igual de "vacíos" o
 * igual de "con respuesta", gana el de FECHA ENTRADA más reciente
 * (`compararFechaEntrada`, que ya cae al orden del archivo si no hay fecha
 * confiable que comparar).
 */
function esEnvioMasReciente(candidato: { fecha: string; respuestas: string[] }, actual: { fecha: string; respuestas: string[] }): boolean {
  const candidatoVacio = candidato.respuestas.length === 0;
  const actualVacio = actual.respuestas.length === 0;
  if (candidatoVacio !== actualVacio) return actualVacio; // uno vacío y el otro no: gana el que sí tiene respuesta
  return compararFechaEntrada(candidato.fecha, actual.fecha) >= 0;
}

/**
 * Algunas cuentas (ej. ADM) exportan el sondeo en formato "largo": una fila
 * por respuesta, con columnas USUARIO, PREGUNTA, RESPUESTA y FECHA ENTRADA
 * (más NOMBRE u otras informativas). Otras (ej. Spin Master) lo traen
 * "ancho": una fila por promotor con una columna por pregunta — el formato
 * que ya esperan calcularMesaControl/Materiales/Marca. Esta función detecta
 * el formato largo (trae columnas PREGUNTA y RESPUESTA) y lo convierte a
 * ancho ANTES de calificar, para no duplicar ninguna regla de cumple/no
 * cumple: aguas abajo todo corre exactamente igual que con un archivo ancho.
 * Si el promotor contestó la misma pregunta más de una vez, se usa el envío
 * con la FECHA ENTRADA más reciente ("respuesta más reciente"); si esa
 * pregunta es de opción múltiple, las respuestas de un mismo envío (misma
 * fecha) se juntan con ", " — igual que ya se escriben las selecciones
 * múltiples en un archivo ancho. Una pregunta que el promotor nunca contestó
 * queda simplemente ausente (celda vacía), nunca se rellena con "No". No
 * aplica nada (regresa tal cual) si el archivo no trae PREGUNTA/RESPUESTA —
 * ya es formato ancho.
 */
export function detectarYConvertirFormatoLargo(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][]; notaFormatoLargo: string | null } {
  if (indiceColumna(headers, 'PREGUNTA') === -1 || indiceColumna(headers, 'RESPUESTA') === -1) {
    return { headers, rows, notaFormatoLargo: null };
  }

  const valor = crearLector(headers);

  type Envio = { usuario: string; posicion: string; pregunta: string; fecha: string; respuestas: string[] };
  const porEnvio = new Map<string, Envio>(); // clave: (usuario normalizado, pregunta, fecha) — un envío = misma pregunta, misma fecha
  const preguntasOrden: string[] = [];
  const preguntasVistas = new Set<string>();

  for (const row of rows) {
    const usuario = valor(row, 'USUARIO');
    const pregunta = valor(row, 'PREGUNTA');
    if (!usuario || !pregunta) continue; // fila inservible para el pivote
    if (!preguntasVistas.has(pregunta)) {
      preguntasVistas.add(pregunta);
      preguntasOrden.push(pregunta);
    }
    // NOMBRE no es POSICION, pero calcularX exige que exista la columna POSICION
    // (solo informativa, nunca califica) — se usa NOMBRE como respaldo cuando el
    // archivo largo no trae POSICION propia.
    const posicion = valor(row, 'POSICION') || valor(row, 'NOMBRE');
    const respuesta = valor(row, 'RESPUESTA');
    const fecha = valorAlias(valor, headers, row, ['FECHA ENTRADA', 'FECHA DE ENTRADA']);
    const claveEnvio = JSON.stringify([normalizar(usuario), pregunta, fecha]);
    let envio = porEnvio.get(claveEnvio);
    if (!envio) {
      envio = { usuario, posicion, pregunta, fecha, respuestas: [] };
      porEnvio.set(claveEnvio, envio);
    }
    if (respuesta) envio.respuestas.push(respuesta);
  }

  type UsuarioPregunta = { usuario: string; posicion: string; pregunta: string; masReciente: Envio; envios: number };
  const porUsuarioPregunta = new Map<string, UsuarioPregunta>();
  for (const envio of porEnvio.values()) {
    const claveUP = JSON.stringify([normalizar(envio.usuario), envio.pregunta]);
    const actual = porUsuarioPregunta.get(claveUP);
    if (!actual) {
      porUsuarioPregunta.set(claveUP, { usuario: envio.usuario, posicion: envio.posicion, pregunta: envio.pregunta, masReciente: envio, envios: 1 });
    } else {
      actual.envios++;
      if (esEnvioMasReciente(envio, actual.masReciente)) {
        actual.masReciente = envio;
        actual.usuario = envio.usuario;
        actual.posicion = envio.posicion;
      }
    }
  }

  const porUsuario = new Map<string, { usuario: string; posicion: string; valores: Map<string, string> }>();
  const usuariosConMultiplesEnvios = new Set<string>();
  for (const up of porUsuarioPregunta.values()) {
    const uKey = normalizar(up.usuario);
    if (!porUsuario.has(uKey)) porUsuario.set(uKey, { usuario: up.usuario, posicion: up.posicion, valores: new Map() });
    porUsuario.get(uKey)!.valores.set(up.pregunta, up.masReciente.respuestas.join(', '));
    if (up.envios > 1) usuariosConMultiplesEnvios.add(uKey);
  }

  const anchoHeaders = ['USUARIO', 'POSICION', ...preguntasOrden];
  const anchoRows = [...porUsuario.values()].map(({ usuario, posicion, valores }) => [
    usuario,
    posicion,
    ...preguntasOrden.map((p) => valores.get(p) ?? ''),
  ]);

  const notaFormatoLargo = `Formato largo detectado: ${rows.length} filas → ${anchoRows.length} promotores (${usuariosConMultiplesEnvios.size} con más de un envío, se usó el más reciente)`;

  return { headers: anchoHeaders, rows: anchoRows, notaFormatoLargo };
}

type FilasDeduplicadas = {
  filas: string[][];
  filasLeidas: number;
  filasSinUsuario: number;
  filasDuplicadas: number;
  enviosVacios: number;
};

/**
 * Si un promotor (USUARIO) aparece más de una vez (varios envíos — varias
 * visitas a tienda), se usa el envío con la FECHA ENTRADA/FECHA DE ENTRADA
 * más reciente (`compararFechaEntrada`, mismo criterio que ya usa el pivote
 * de formato largo); si el archivo no trae esa columna (o la fecha no se
 * puede comparar), se usa el último en el orden del archivo. Antes de
 * comparar fechas, un envío sin ninguna respuesta reconocible en
 * `columnasRelevantes` (las preguntas que califican el sondeo) se ignora por
 * completo — "vacío no es cero": nunca gana la elección del envío del
 * promotor, y si TODOS los envíos de un promotor están vacíos, ese promotor
 * no cuenta como "contestó" (queda fuera de `filas`). Filas sin USUARIO se
 * descartan (no cuentan en el universo). Si el archivo no trae columna
 * USUARIO, no se puede deduplicar y se devuelve tal cual (validarColumnas ya
 * habría fallado antes de esto).
 */
function deduplicarPorUsuario(headers: string[], rows: string[][], columnasRelevantes: string[]): FilasDeduplicadas {
  const filasLeidas = rows.length;
  const idxUsuario = indiceColumna(headers, 'USUARIO');
  if (idxUsuario === -1) {
    return { filas: rows, filasLeidas, filasSinUsuario: 0, filasDuplicadas: 0, enviosVacios: 0 };
  }
  const valor = crearLector(headers);

  type Candidato = { row: string[]; fecha: string };
  const porUsuario = new Map<string, Candidato[]>();
  let filasSinUsuario = 0;
  let enviosVacios = 0;

  for (const row of rows) {
    const usuario = normalizar(row[idxUsuario] ?? '');
    if (!usuario) {
      filasSinUsuario++;
      continue;
    }
    if (columnasRelevantes.every((columna) => valor(row, columna) === '')) {
      enviosVacios++;
      continue;
    }
    const fecha = valorAlias(valor, headers, row, ['FECHA ENTRADA', 'FECHA DE ENTRADA']);
    const candidatos = porUsuario.get(usuario);
    if (candidatos) candidatos.push({ row, fecha });
    else porUsuario.set(usuario, [{ row, fecha }]);
  }

  let filasDuplicadas = 0;
  const filas: string[][] = [];
  for (const candidatos of porUsuario.values()) {
    filasDuplicadas += candidatos.length - 1;
    let mejor = candidatos[0];
    for (let i = 1; i < candidatos.length; i++) {
      if (compararFechaEntrada(candidatos[i].fecha, mejor.fecha) >= 0) mejor = candidatos[i];
    }
    filas.push(mejor.row);
  }

  return { filas, filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios };
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

export type Calculo = { filas: EmetrixFilaDetalle[]; cumplieron: number; diagnostico: EmetrixDiagnosticoArchivo; preguntas: EmetrixPreguntaResumen[] };

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

export const MESA_CONTROL_PREGUNTAS: Array<{ label: string; columna: string }> = [
  { label: 'Entrada a tienda', columna: '¿Pudiste entrar a tu tienda el primer día?' },
  { label: 'Emetrix funcionó', columna: '¿Tu usuario Emetrix funciono cuando lo necesitaste?' },
  { label: 'Te explicaron las marcas', columna: '¿Te explicaron que marcas y productos atender?' },
  { label: 'Recibiste saldo', columna: '¿Ya recibiste tu saldo?' },
];

/** Cumple = SI en las 4 preguntas de fondo. "Quién te acompañó" es solo informativo, no califica. */
export function calcularMesaControl(headers: string[], rows: string[][]): Calculo {
  validarColumnas(headers, MESA_CONTROL_COLUMNAS, 'Mesa de Control');
  const valor = crearLector(headers);
  const columnasRelevantes = MESA_CONTROL_PREGUNTAS.map((p) => p.columna);
  const { filas: filasUnicas, filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios } = deduplicarPorUsuario(headers, rows, columnasRelevantes);

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
    diagnostico: { filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios, formatoLargo: null, columnaUsuario: null },
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
  const columnasRelevantes = incluyeCelular
    ? [...PRENDAS_OBLIGATORIAS, '¿Ya recibiste tu celular de trabajo?', '¿Tienes Emetrix instalado y funcionando con tu usuario?']
    : PRENDAS_OBLIGATORIAS;
  const { filas: filasUnicas, filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios } = deduplicarPorUsuario(headers, rows, columnasRelevantes);

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
    diagnostico: { filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios, formatoLargo: null, columnaUsuario: null },
    preguntas,
  };
}

// ---- Marca ----

// Regla oficial (confirmada contra la plataforma de Dirección, 2026-09-30):
// SOLO P2 y P7 son de selección múltiple — correctas si la respuesta INCLUYE
// la opción correcta, aunque el promotor haya marcado más de una ('contiene').
// Las otras 8 (P1, P3, P4, P5, P6, P8, P9, P10) son de opción única — correctas
// SOLO si eligió EXACTAMENTE la opción correcta; marcar varias es incorrecto
// aunque incluyan la correcta ('exacto'). Antes, 6 de esas 8 (todas menos P8 y
// P9) estaban mal marcadas como 'contiene', lo que aceptaba de más selecciones
// múltiples que Dirección califica como incorrectas.
const MARCA_PREGUNTAS: Array<{ columna: string; modo: 'contiene' | 'exacto'; esperado: string }> = [
  {
    // P1
    columna: 'Un producto imperdible de tu cuenta no está en anaquel, pero hay piezas en bodega. ¿Qué haces?',
    modo: 'exacto',
    esperado: 'Lo surto de inmediato y lo registro en Emetrix',
  },
  { columna: 'Al surtir, ¿cómo acomodas el producto?', modo: 'contiene', esperado: 'Lo que caduca antes, al frente' }, // P2 — selección múltiple
  {
    // P3
    columna: 'Encuentras en anaquel un producto de tu marca con el empaque golpeado o a punto de caducar. ¿Qué haces?',
    modo: 'exacto',
    esperado: 'Lo retiro y lo reporto como lo pide la tienda',
  },
  {
    // P4
    columna: 'En bodega hay cajas sin acomodar y necesitas tu producto. ¿Cómo lo ubicas?',
    modo: 'exacto',
    esperado: 'Por el código o la descripción en la etiqueta de la caja',
  },
  {
    // P5
    columna: 'Un producto de la competencia está ocupando el espacio de tu marca en el anaquel. ¿Qué haces?',
    modo: 'exacto',
    esperado: 'Lo reporto al encargado de piso y lo registro en Emetrix',
  },
  {
    // P6
    columna: 'Según el planograma, la presentación grande va abajo, pero la encuentras arriba. ¿Qué haces?',
    modo: 'exacto',
    esperado: 'La acomodo según el planograma y lo registro',
  },
  { columna: 'El fleje dice $45 y en caja cobran $52. ¿Qué haces?', modo: 'contiene', esperado: 'Lo reporto al encargado y lo registro en Emetrix' }, // P7 — selección múltiple
  { columna: 'Un producto tiene 20 piezas en bodega y cero ventas en dos semanas. ¿Qué es?', modo: 'exacto', esperado: 'Venta cero' }, // P8
  {
    // P9
    columna: '¿Cómo debe quedar el frente de tu producto en el anaquel?',
    modo: 'exacto',
    esperado: 'Al borde del anaquel, con la etiqueta hacia el cliente',
  },
  {
    // P10
    columna: 'Te toca armar una exhibición adicional y te falta material POP. ¿Qué haces?',
    modo: 'exacto',
    esperado: 'La armo con lo que hay y reporto el faltante con foto en Emetrix',
  },
];

const MARCA_COLUMNAS = ['USUARIO', 'POSICION', ...MARCA_PREGUNTAS.map((p) => p.columna)];

/** Cumple = acierta 8 de 10 o más. */
export function calcularMarca(headers: string[], rows: string[][]): Calculo {
  validarColumnas(headers, MARCA_COLUMNAS, 'Marca');
  const valor = crearLector(headers);
  const columnasRelevantes = MARCA_PREGUNTAS.map((p) => p.columna);
  const { filas: filasUnicas, filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios } = deduplicarPorUsuario(headers, rows, columnasRelevantes);

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
    diagnostico: { filasLeidas, filasSinUsuario, filasDuplicadas, enviosVacios, formatoLargo: null, columnaUsuario: null },
    preguntas,
  };
}

// ---- % de respuesta / % de cumplimiento ----

/**
 * % de respuesta (respondieron/universo, cobertura del sondeo) y % de
 * cumplimiento (cumplieron/respondieron, calidad SOLO entre quienes
 * contestaron) — separados a propósito: un universo con poca respuesta no
 * debe verse artificialmente mal o bien en el % de cumplimiento, se marca
 * aparte como "en alerta". Sin universo (null), el % de respuesta queda
 * indefinido (null) — no hay con qué medir cobertura.
 */
export function calcularPorcentajes(
  universo: number | null,
  respondieron: number,
  cumplieron: number
): { porcentaje: number; porcentajeRespuesta: number | null } {
  const porcentajeRespuesta = universo !== null && universo > 0 ? Math.round((respondieron / universo) * 10000) / 100 : universo === null ? null : 0;
  const porcentaje = respondieron > 0 ? Math.round((cumplieron / respondieron) * 10000) / 100 : 0;
  return { porcentaje, porcentajeRespuesta };
}

/** null si no hay carga (sin datos todavía). Si hay carga pero nadie contestó, 0%. */
export function calcularPorcentajeRespuesta(universo: number | null, respondieron: number | null): number | null {
  if (universo === null || respondieron === null) return null;
  return universo > 0 ? Math.round((respondieron / universo) * 10000) / 100 : 0;
}

export type ResultadoKrPeso = { porcentaje: number | null; peso: number };

/**
 * El % del OKR (o de "Resultado por cuenta") es el promedio ponderado SOLO
 * de los KR que sí tienen carga — un KR sin datos queda fuera de la cuenta
 * (no cuenta como 0%, no castiga el total). null si ningún KR tiene carga
 * todavía.
 */
export function calcularTotalPonderado(krs: ResultadoKrPeso[]): number | null {
  const conDatos = krs.filter((k) => k.porcentaje !== null);
  const sumaPesos = conDatos.reduce((s, k) => s + k.peso, 0);
  if (conDatos.length === 0 || sumaPesos === 0) return null;
  const sumaPonderada = conDatos.reduce((s, k) => s + k.porcentaje! * k.peso, 0);
  return Math.round((sumaPonderada / sumaPesos) * 100) / 100;
}

// ---- Árbol del OKR oficial "Ciclo de vida del promotor" (indicadores) ----
//
// Espejo exacto (mismos nombres, mismos pesos) del archivo de Carlos que se
// conecta a EvolveOS: OKR = KR1×30% + KR2×40% + KR3×30%. Los KPI de KR1 y KR3
// que NO salen de un sondeo (Contrato firmado, Alta ante el IMSS, Módulos
// publicados en Emetrix) son captura manual — un indicador de una cuenta y
// UN periodo, igual que los de sondeo (se capturan mes con mes, no una vez
// para siempre). Ningún KPI pendiente cuenta como 0%: el % de su KR
// se calcula solo con los KPI que sí tienen dato, redistribuyendo el peso
// entre esos (igual en OKR respecto a sus 3 KR).

const OKR_AREA = 'Operaciones';

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- Nombres oficiales (lib/okr-oficial.ts) por código de nodo ----

type OficialInfo = { nombreOficial: string; meta: number | null; kpiCode: string | null };

/** Mapa código → {nombreOficial, meta, kpiCode} de TODO el OKR oficial (OKR, sus 3 KR, sus 7 KPI), armado una sola vez a partir de `lib/okr-oficial.ts` (archivo de datos, sin lógica) — así ningún nodo del árbol duplica el texto oficial a mano. */
const OKR_OFICIAL_POR_CODIGO: Record<string, OficialInfo> = (() => {
  const mapa: Record<string, OficialInfo> = {
    OKR: { nombreOficial: OKR_OFICIAL.nombreOficial, meta: null, kpiCode: OKR_OFICIAL.kpiCode },
  };
  for (const kr of OKR_OFICIAL.krs) {
    mapa[kr.codigo] = { nombreOficial: kr.nombreOficial, meta: null, kpiCode: kr.kpiCode };
    for (const kpi of kr.kpis) {
      mapa[kpi.codigo] = { nombreOficial: kpi.nombreOficial, meta: kpi.meta, kpiCode: kpi.kpiCode };
    }
  }
  return mapa;
})();

/** {nombreOficial, meta, kpiCode} de un código de nodo del árbol OKR — lanza si el código no está en `lib/okr-oficial.ts` (los 11 códigos del árbol están todos ahí; si esto truena es que un código del árbol y el de los nombres oficiales se desalinearon). */
function oficialDe(codigo: string): OficialInfo {
  const info = OKR_OFICIAL_POR_CODIGO[codigo];
  if (!info) throw new Error(`Código sin nombre oficial en lib/okr-oficial.ts: "${codigo}".`);
  return info;
}

function indicadorMedido(valor: number, base: string | null, motivo: string): EmetrixIndicador {
  return { estado: 'medido', valor: redondear2(valor), base, motivo };
}

function indicadorSinMedir(motivo: string): EmetrixIndicador {
  return { estado: 'sin-medir', valor: null, base: null, motivo };
}

/** Indicador de un nodo agregado (KR/OKR) a partir de sus hijos ya calculados — promedio ponderado SOLO de los hijos medidos, redistribuyendo su peso. */
function agregarIndicador(hijos: EmetrixOkrNodo[], unidad: string, motivoCompleto: string): EmetrixIndicador {
  const conDato = hijos.filter((h) => h.indicador.estado === 'medido');
  if (conDato.length === 0) {
    return indicadorSinMedir(`Ningún ${unidad} tiene dato todavía (0 de ${hijos.length}).`);
  }
  const sumaPesos = conDato.reduce((s, h) => s + h.peso, 0);
  if (sumaPesos === 0) {
    return indicadorSinMedir(`Ningún ${unidad} con dato tiene peso asignado.`);
  }
  const valor = conDato.reduce((s, h) => s + h.indicador.valor! * h.peso, 0) / sumaPesos;
  if (conDato.length < hijos.length) {
    return indicadorMedido(
      valor,
      `${conDato.length} de ${hijos.length} ${unidad}`,
      `Calculado con ${conDato.length} de ${hijos.length} ${unidad} (los demás están pendientes y no cuentan como 0%).`
    );
  }
  return indicadorMedido(valor, null, motivoCompleto);
}

/** Arma un nodo OKR/KR (nivel agregado) a partir de sus hijos ya calculados. */
function nodoAgregado(
  base: { nivel: 'okr' | 'kr'; codigo: string; nombre: string; descripcion: string; capa: string; owner: string; peso: number },
  hijos: EmetrixOkrNodo[],
  unidadHijos: string,
  fuente: string
): EmetrixOkrNodo {
  return {
    ...base,
    ...oficialDe(base.codigo),
    area: OKR_AREA,
    indicador: agregarIndicador(hijos, unidadHijos, fuente),
    fuente,
    hijos,
  };
}

/** KPI de KR1 alimentado por una pregunta puntual de Mesa de Control (de la carga de ESTE periodo). */
function kpiDeMesaControl(
  codigo: string,
  nombre: string,
  labelPregunta: string,
  columnaPregunta: string,
  preguntasMesaControl: EmetrixPreguntaResumen[] | null
): EmetrixOkrNodo {
  const p = preguntasMesaControl?.find((x) => x.pregunta === labelPregunta) ?? null;
  // `numerador` no existía antes de 2026-09-27 — cargas guardadas con el
  // código viejo tienen preguntas_resumen sin ese campo (undefined al leerlo
  // de la base). Se reconstruye a partir de porcentaje/contestaron (inverso
  // exacto de cómo se calculó) para no mostrar "undefined de N" en cargas
  // históricas; las cargas nuevas ya traen numerador guardado tal cual.
  const numerador = p && p.numerador != null ? p.numerador : p ? Math.round((p.porcentaje! / 100) * p.contestaron) : 0;
  const indicador = !preguntasMesaControl
    ? indicadorSinMedir('Falta cargar Mesa de Control en este periodo.')
    : !p || p.porcentaje === null
      ? indicadorSinMedir(`La pregunta "${columnaPregunta}" no se reconoció en el archivo de Mesa de Control de este periodo.`)
      : indicadorMedido(
          p.porcentaje,
          `${numerador} de ${p.contestaron}`,
          `${numerador} de ${p.contestaron} promotores contestaron "Sí" a "${columnaPregunta}".`
        );
  const fuente = preguntasMesaControl
    ? `Sondeo Mesa de Control — pregunta "${labelPregunta}"${p && p.porcentaje !== null ? ` (${p.contestaron} contestaron)` : ''}`
    : 'Sondeo Mesa de Control';
  return {
    nivel: 'kpi',
    codigo,
    area: OKR_AREA,
    nombre,
    ...oficialDe(codigo),
    descripcion: `% de "Sí" en "${columnaPregunta}" (Mesa de Control)`,
    capa: 'Actividad',
    owner: 'Mesa de Control',
    peso: 25,
    indicador,
    fuente,
    hijos: [],
  };
}

/** Alias local del tipo de types.ts, para no repetir el nombre completo en cada firma de función de esta sección. */
type EntradaKpiManualBase = EmetrixKpiManualBase;

/**
 * Valida que el numerador no sea mayor al denominador (cuando ambos existen)
 * — para el KPI de captura manual con base ("18 de 20"). null si es válido o
 * si falta alguno de los dos números (una captura incompleta se valida por
 * separado como "sin medir", no como error).
 */
export function validarBaseManual(numerador: number | null, denominador: number | null): string | null {
  if (numerador === null || denominador === null) return null;
  if (numerador < 0 || denominador < 0) return 'El numerador y el denominador no pueden ser negativos.';
  if (numerador > denominador) return `El numerador (${numerador}) no puede ser mayor al denominador (${denominador}).`;
  return null;
}

/**
 * Indicador de un KPI de captura manual con base (numerador/denominador,
 * sección 4-bis): si ambos números están capturados este periodo, el % y el
 * motivo salen de ahí — "18 de 20 {textoRelacion}." — salvo que el
 * denominador sea 0 (no hubo qué medir ese mes), donde el indicador vale
 * 100% con `textoSinBase` como motivo. Si falta cualquiera de los dos
 * números, cae al `legacyPorcentaje` (formato viejo, antes de esta captura
 * con base) si existe, y si no, queda "sin medir".
 */
function indicadorManualConBase(entrada: EntradaKpiManualBase, owner: string, textoRelacion: string, textoSinBase: string, motivoPendiente: string): EmetrixIndicador {
  const { numerador, denominador, legacyPorcentaje } = entrada;
  if (numerador !== null && denominador !== null) {
    if (denominador === 0) return indicadorMedido(100, '0 de 0', textoSinBase);
    return indicadorMedido((numerador / denominador) * 100, `${numerador} de ${denominador}`, `${numerador} de ${denominador} ${textoRelacion}.`);
  }
  if (legacyPorcentaje !== null) {
    return indicadorMedido(legacyPorcentaje, null, `Capturado a mano por ${owner}: ${redondear2(legacyPorcentaje)}%.`);
  }
  return indicadorSinMedir(motivoPendiente);
}

/** KPI de captura manual con base (no sale de ningún sondeo) — un indicador es de una cuenta y UN periodo, igual que los de sondeo. `motivoPendiente` explica qué falta capturar y quién es el dueño. */
function kpiManualBase(
  codigo: string,
  nombre: string,
  descripcion: string,
  owner: string,
  peso: number,
  entrada: EntradaKpiManualBase,
  textoRelacion: string,
  textoSinBase: string,
  motivoPendiente: string
): EmetrixOkrNodo {
  const indicador = indicadorManualConBase(entrada, owner, textoRelacion, textoSinBase, motivoPendiente);
  return {
    nivel: 'kpi',
    codigo,
    area: OKR_AREA,
    nombre,
    ...oficialDe(codigo),
    descripcion,
    capa: 'Actividad',
    owner,
    peso,
    indicador,
    fuente: 'Captura manual',
    hijos: [],
  };
}

/** Entrada de un KPI que sale del % de cumplimiento de un sondeo completo (Materiales, Marca) para la carga de ESTE periodo. null si no hay carga de ese sondeo en este periodo. */
export type EntradaKpiSondeo = { cumplieron: number; respondieron: number; porcentaje: number } | null;

/** KPI alimentado por el % de cumplimiento (tal cual, regla vigente sin cambios) de un sondeo completo, en ESTE periodo. `motivoTexto` arma el motivo cuando sí hay dato — por default "X de Y promotores que contestaron {krLabel} cumplieron los requisitos.", pero KR3.2 (Módulo completado) lo sobreescribe para dejar explícito que es una aproximación. */
function kpiDeSondeo(
  codigo: string,
  nombre: string,
  descripcion: string,
  owner: string,
  peso: number,
  krLabel: string,
  entrada: EntradaKpiSondeo,
  motivoTexto: (entrada: { cumplieron: number; respondieron: number }) => string = (e) =>
    `${e.cumplieron} de ${e.respondieron} promotores que contestaron ${krLabel} cumplieron los requisitos.`
): EmetrixOkrNodo {
  const indicador = !entrada
    ? indicadorSinMedir(`Falta cargar ${krLabel} en este periodo.`)
    : indicadorMedido(entrada.porcentaje, `${entrada.cumplieron} de ${entrada.respondieron}`, motivoTexto(entrada));
  const fuente = entrada ? `Sondeo ${krLabel} — % de cumplimiento` : `Sondeo ${krLabel}`;
  return { nivel: 'kpi', codigo, area: OKR_AREA, nombre, ...oficialDe(codigo), descripcion, capa: 'Actividad', owner, peso, indicador, fuente, hijos: [] };
}

/** Insumos (ya obtenidos de la base, o sintéticos en pruebas) para construir el árbol OKR de una cuenta en un periodo. */
export type ConstruirArbolOkrInput = {
  /** % de cumplimiento de Materiales de la carga de ESTE periodo. null si no hay carga de Materiales en este periodo. */
  materiales: EntradaKpiSondeo;
  /** % de cumplimiento de Tu Marca de la carga de ESTE periodo. null si no hay carga de Marca en este periodo. */
  marca: EntradaKpiSondeo;
  /** Desglose por pregunta de la carga de Mesa de Control de ESTE periodo. null si no hay carga de Mesa de Control en este periodo. */
  mesaControlPreguntas: EmetrixPreguntaResumen[] | null;
  /** KPI de captura manual con base (numerador/denominador) DE ESTE PERIODO (una cuenta × un mes, igual que los de sondeo). Ambos números en null = pendiente de captura ese mes (o cae al % viejo en `legacyPorcentaje` si esa cuenta ya lo había capturado con el formato anterior). */
  contratoFirmado: EntradaKpiManualBase;
  imss: EntradaKpiManualBase;
  modulosPublicados: EntradaKpiManualBase;
};

/**
 * Construye el árbol OKR → KR → KPI de una cuenta para un periodo, espejo
 * exacto del OKR oficial "Ciclo de vida del promotor" (mismos nombres,
 * mismos pesos: OKR = KR1×30% + KR2×40% + KR3×30%). Pura: no toca la base ni
 * la pantalla — recibe los datos ya obtenidos (ver fetchResultadoOkrCuenta en
 * lib/emetrix-ponderacion.ts, que solo hace las consultas y delega aquí el
 * cálculo). No cambia ninguna regla de cumple/no cumple de los sondeos.
 */
export function construirArbolOkr(input: ConstruirArbolOkrInput): EmetrixOkrNodo {
  const entradaPregunta = (label: string) => MESA_CONTROL_PREGUNTAS.find((p) => p.label === label)!.columna;

  const kr1Kpis = [
    kpiDeMesaControl('KR1.1', 'Carta de acceso y credencial', 'Entrada a tienda', entradaPregunta('Entrada a tienda'), input.mesaControlPreguntas),
    kpiDeMesaControl('KR1.2', 'Usuario en Emetrix', 'Emetrix funcionó', entradaPregunta('Emetrix funcionó'), input.mesaControlPreguntas),
    kpiManualBase(
      'KR1.3',
      'Contrato firmado',
      'Captura manual: nuevos ingresos que firmaron contrato antes de su primer día, de los nuevos ingresos del mes',
      'Legal',
      25,
      input.contratoFirmado,
      'nuevos ingresos firmaron contrato antes de su primer día',
      'Sin nuevos ingresos en el periodo.',
      'Falta el dato de Legal (firmados antes del ingreso y nuevos ingresos del mes).'
    ),
    kpiManualBase(
      'KR1.4',
      'Alta ante el IMSS',
      'Captura manual: nuevos ingresos dados de alta ante el IMSS antes de su primer día, de los nuevos ingresos del mes',
      'Nómina',
      25,
      input.imss,
      'nuevos ingresos tuvieron alta ante el IMSS antes de su primer día',
      'Sin nuevos ingresos en el periodo.',
      'Falta el dato de Nómina (altas antes del ingreso y nuevos ingresos del mes).'
    ),
  ];
  const kr1 = nodoAgregado(
    {
      nivel: 'kr',
      codigo: 'KR1',
      nombre: 'Kit administrativo entregado a tiempo',
      descripcion: 'Documentos y accesos que el promotor debe tener listos al arrancar.',
      capa: 'Resultado',
      owner: 'Operaciones',
      peso: 30,
    },
    kr1Kpis,
    'KPI',
    'Promedio ponderado de sus 4 KPI'
  );

  const kr2Kpis = [
    kpiDeSondeo('KR2.1', 'Materiales completos', '% de cumplimiento del sondeo Materiales (regla vigente, sin cambios)', 'Operaciones', 100, 'Materiales', input.materiales),
  ];
  const kr2 = nodoAgregado(
    {
      nivel: 'kr',
      codigo: 'KR2',
      nombre: 'Materiales de campo entregados en calendario',
      descripcion: 'Kit de materiales de campo completo y a tiempo.',
      capa: 'Resultado',
      owner: 'Operaciones',
      peso: 40,
    },
    kr2Kpis,
    'KPI',
    'KPI único: Materiales completos'
  );

  const kr3Kpis = [
    kpiManualBase(
      'KR3.1',
      'Módulos publicados en Emetrix',
      'Captura manual: módulos de capacitación publicados en Emetrix, de los módulos programados a la fecha',
      'Capacitación',
      50,
      input.modulosPublicados,
      'módulos programados están publicados en Emetrix',
      'Sin módulos programados en el periodo.',
      'Falta el dato de Capacitación (publicados y programados a la fecha).'
    ),
    kpiDeSondeo(
      'KR3.2',
      'Módulo completado (aproximación)',
      '% de cumplimiento del sondeo Tu Marca (8 de 10 o más, regla vigente, sin cambios) — aproximación de módulo completado',
      'Capacitación',
      50,
      'Tu Marca',
      input.marca,
      (e) => `Aproximación: ${e.cumplieron} de ${e.respondieron} aprobaron Tu Marca (8 de 10 correctas).`
    ),
  ];
  const kr3 = nodoAgregado(
    {
      nivel: 'kr',
      codigo: 'KR3',
      nombre: 'Capacitación en módulos',
      descripcion: 'Avance de capacitación de marca y contenido operativo.',
      capa: 'Resultado',
      owner: 'Capacitación',
      peso: 30,
    },
    kr3Kpis,
    'KPI',
    'Promedio ponderado de sus 2 KPI'
  );

  const krs = [kr1, kr2, kr3];
  return nodoAgregado(
    {
      nivel: 'okr',
      codigo: 'OKR',
      nombre: 'Ciclo de vida del promotor',
      descripcion: 'OKR oficial de incorporación del promotor, conectado a EvolveOS.',
      capa: 'Resultado',
      owner: 'Operaciones',
      peso: 100,
    },
    krs,
    'KR',
    'Promedio ponderado de sus 3 KR'
  );
}

/** Aplana un árbol OKR → KR → KPI en preorden (el nodo, luego sus hijos), para tablas/Excel. */
export function aplanarArbolOkr(nodo: EmetrixOkrNodo): EmetrixOkrNodo[] {
  return [nodo, ...nodo.hijos.flatMap(aplanarArbolOkr)];
}

/** Mapa código → nodo de TODO el árbol (OKR, sus 3 KR, y los 7 KPI hoja), para leer un indicador puntual por código sin recorrer el árbol cada vez (ver vistas "Cómo va cada cuenta"/"Pendientes de indicador"). */
export function indicadoresPlanos(raiz: EmetrixOkrNodo): Record<string, EmetrixOkrNodo> {
  const mapa: Record<string, EmetrixOkrNodo> = {};
  for (const nodo of aplanarArbolOkr(raiz)) mapa[nodo.codigo] = nodo;
  return mapa;
}

/** Los 7 KPI hoja del árbol, en el orden en que se muestran en "Cómo va cada cuenta" (guía de indicadores de Operaciones). */
export const KPI_CODIGOS_HOJA = ['KR1.1', 'KR1.2', 'KR1.3', 'KR1.4', 'KR2.1', 'KR3.1', 'KR3.2'] as const;

/** Los 3 KPI de captura manual (no salen de ningún sondeo). */
export const KPI_CODIGOS_MANUAL = ['KR1.3', 'KR1.4', 'KR3.1'] as const;

/** Etiqueta de cada sondeo, en el mismo orden que se sube en pantalla. */
export const KR_LABEL_SONDEO: Record<EmetrixKr, string> = { mesa_control: 'Mesa de Control', materiales: 'Materiales', marca: 'Marca' };

/** Orden en que se listan los 3 sondeos en "Pendientes de indicador" (mismo orden que el resto de la pantalla). */
const KR_ORDEN_SONDEO: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];

/**
 * Color de la pastilla de un indicador, según la guía de indicadores de
 * Operaciones: verde ≥90, amarillo ≥70, rojo abajo de 70 — y `'sin-medir'`
 * (gris, borde punteado en pantalla) para un hueco, que NUNCA debe leerse
 * como incumplimiento (rojo).
 */
export function pillEstado(indicador: EmetrixIndicador): 'good' | 'warn' | 'bad' | 'sin-medir' {
  if (indicador.estado === 'sin-medir' || indicador.valor === null) return 'sin-medir';
  if (indicador.valor >= 90) return 'good';
  if (indicador.valor >= 70) return 'warn';
  return 'bad';
}

/**
 * Texto para mostrar un indicador junto con su base y su meta oficial (sección
 * 2 de la guía de indicadores), ej. "97.73% · 43 de 44 · meta 100%". `meta` es
 * `null` en los nodos KR/OKR agregados (no tienen meta individual propia) —
 * en ese caso el texto no trae "· meta". "Sin medir" se muestra tal cual, sin
 * base ni meta (no hay número que acompañar).
 */
export function formatIndicadorConMeta(indicador: EmetrixIndicador, meta: number | null): string {
  if (indicador.estado !== 'medido' || indicador.valor === null) return 'Sin medir';
  const partes = [`${indicador.valor}%`];
  if (indicador.base !== null) partes.push(indicador.base);
  if (meta !== null) partes.push(`meta ${meta}%`);
  return partes.join(' · ');
}

/** Un dato (KPI) con al menos una cuenta sin medir en el periodo, agrupado con su responsable — ej. "Falta Contrato firmado: 3 cuentas · Legal". */
export type PendienteDato = { codigo: string; nombre: string; owner: string; cuentas: string[] };

/** Una cuenta con al menos un hueco en el periodo: qué sondeos no se han cargado, qué KPI manuales faltan, y si le falta el headcount (dato de cuenta, no de periodo). */
export type PendienteCuenta = {
  marcaId: string;
  marcaNombre: string;
  sondeosFaltantes: string[];
  kpisManualesFaltantes: string[];
  headcountFaltante: boolean;
};

export type Pendientes = {
  porDato: PendienteDato[];
  porCuenta: PendienteCuenta[];
  /** Cuentas sin headcount capturado (no es por periodo) — separado aparte porque afecta el % de respuesta de los 3 sondeos, no un KPI puntual. */
  headcountFaltante: string[];
};

/**
 * Qué falta, para todas las cuentas, en el periodo consultado — para que un
 * hueco deje de serlo. Pura: recibe el árbol OKR y `sondeosCargadoEn` ya
 * calculados de cada cuenta (ver fetchResultadoOkrTodasCuentas en
 * lib/emetrix-ponderacion.ts), no toca la base.
 */
export function calcularPendientes(
  cuentas: Array<{
    marcaId: string;
    marcaNombre: string;
    raiz: EmetrixOkrNodo;
    sondeosCargadoEn: Record<EmetrixKr, string | null>;
    headcountManual: number | null;
  }>
): Pendientes {
  const porDatoMapa = new Map<string, PendienteDato>();
  const porCuenta: PendienteCuenta[] = [];
  const headcountFaltante: string[] = [];

  for (const cuenta of cuentas) {
    const planos = indicadoresPlanos(cuenta.raiz);

    // Indicadores que salen de sondeo (Carta de acceso/Usuario Emetrix de Mesa
    // de Control, Materiales, Módulo completado de Tu Marca): el hueco es del
    // EJECUTIVO DE LA CUENTA (falta subir el sondeo), no del área dueña del
    // KPI — se agrupan por sondeo, no uno por KPI, para no repetir la misma
    // cuenta en dos líneas cuando falta un único archivo (Mesa de Control trae
    // 2 KPI hoja).
    for (const kr of KR_ORDEN_SONDEO) {
      if (cuenta.sondeosCargadoEn[kr]) continue;
      const codigo = `sondeo:${kr}`;
      const entrada = porDatoMapa.get(codigo) ?? { codigo, nombre: `subir sondeo ${KR_LABEL_SONDEO[kr]}`, owner: 'Ejecutivo de la cuenta', cuentas: [] };
      entrada.cuentas.push(cuenta.marcaNombre);
      porDatoMapa.set(codigo, entrada);
    }

    // Los 3 KPI de captura manual (Contrato, Alta IMSS, Módulos publicados) SÍ
    // se agrupan por su área dueña real (Legal/Nómina/Capacitación).
    for (const codigo of KPI_CODIGOS_MANUAL) {
      const nodo = planos[codigo];
      if (!nodo || nodo.indicador.estado !== 'sin-medir') continue;
      const entrada = porDatoMapa.get(codigo) ?? { codigo, nombre: nodo.nombre, owner: nodo.owner, cuentas: [] };
      entrada.cuentas.push(cuenta.marcaNombre);
      porDatoMapa.set(codigo, entrada);
    }

    const sondeosFaltantes = (Object.keys(KR_LABEL_SONDEO) as EmetrixKr[])
      .filter((kr) => !cuenta.sondeosCargadoEn[kr])
      .map((kr) => KR_LABEL_SONDEO[kr]);
    const kpisManualesFaltantes = KPI_CODIGOS_MANUAL.filter((codigo) => planos[codigo]?.indicador.estado === 'sin-medir').map(
      (codigo) => planos[codigo]!.nombre
    );
    const headcountFaltanteCuenta = cuenta.headcountManual === null;
    if (headcountFaltanteCuenta) headcountFaltante.push(cuenta.marcaNombre);

    if (sondeosFaltantes.length > 0 || kpisManualesFaltantes.length > 0 || headcountFaltanteCuenta) {
      porCuenta.push({
        marcaId: cuenta.marcaId,
        marcaNombre: cuenta.marcaNombre,
        sondeosFaltantes,
        kpisManualesFaltantes,
        headcountFaltante: headcountFaltanteCuenta,
      });
    }
  }

  return { porDato: [...porDatoMapa.values()], porCuenta, headcountFaltante };
}

// ---- Lectura para EvolveOS: GET /api/okr-resultados (sección 4-quater) ----

/**
 * Arma la respuesta de `GET /api/okr-resultados?periodo=YYYY-MM` en el
 * formato de la guía de indicadores de Operaciones: un indicador por cuenta ×
 * KPI hoja, con el nombre LITERAL del OKR oficial (`lib/okr-oficial.ts`).
 * Pura: recibe el árbol OKR de cada cuenta ya calculado (mismo
 * `fetchResultadoOkrTodasCuentas` que usa la pantalla, ver
 * lib/emetrix-ponderacion.ts) — no hay una segunda copia del cálculo. Un KPI
 * `'sin-medir'` se manda con `medible: false`, `valor: null` y su `motivo`,
 * nunca como 0; un 0% medido (ej. Materiales en Hanes) se manda con
 * `medible: true`, `valor: 0`.
 */
export function construirRespuestaOkrLectura(periodo: string, cuentas: Array<{ marcaNombre: string; raiz: EmetrixOkrNodo }>): OkrLecturaRespuesta {
  const indicadores: OkrLecturaIndicador[] = [];
  for (const cuenta of cuentas) {
    const planos = indicadoresPlanos(cuenta.raiz);
    for (const codigo of KPI_CODIGOS_HOJA) {
      const nodo = planos[codigo];
      if (!nodo) continue;
      indicadores.push({
        kpi_code: nodo.kpiCode,
        indicador: `${cuenta.marcaNombre} — ${nodo.nombreOficial}`,
        medible: nodo.indicador.estado === 'medido',
        valor: nodo.indicador.estado === 'medido' ? nodo.indicador.valor : null,
        base: nodo.indicador.base,
        motivo: nodo.indicador.motivo,
      });
    }
  }
  return { okr: OKR_OFICIAL.nombreOficial, periodo: { tipo: 'MES', inicio: periodoInicioISO(periodo) }, indicadores };
}
