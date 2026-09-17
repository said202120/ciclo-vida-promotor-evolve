// Funciones puras (sin acceso a base de datos) usadas tanto en el navegador
// (para armar la vista previa sin ida y vuelta al servidor) como en la ruta
// que aplica los cambios (para volver a parsear las fechas antes de guardar).

import type { ImportMapeo } from './types';

export type RegistroExtraido = {
  rfc: string; // normalizado: trim + mayúsculas. Puede venir vacío si la fila no trae RFC.
  contratoFecha: string | null; // texto crudo de la celda mapeada a "Fecha de contrato firmado"
  imssFecha: string | null; // texto crudo de la celda mapeada a "Fecha de alta IMSS"
};

/** Encuentra, para cada campo único, la primera columna del archivo que se le asignó. */
function buildColumnIndex(headers: string[], mapeo: ImportMapeo) {
  let rfcIdx = -1;
  let contratoIdx = -1;
  let imssIdx = -1;
  headers.forEach((h, i) => {
    const campo = mapeo[h];
    if (campo === 'rfc' && rfcIdx === -1) rfcIdx = i;
    if (campo === 'contratoFecha' && contratoIdx === -1) contratoIdx = i;
    if (campo === 'imssFecha' && imssIdx === -1) imssIdx = i;
  });
  return { rfcIdx, contratoIdx, imssIdx };
}

/** Convierte cada fila cruda del archivo en un registro según el mapeo confirmado. */
export function extractRegistros(headers: string[], rows: string[][], mapeo: ImportMapeo): RegistroExtraido[] {
  const { rfcIdx, contratoIdx, imssIdx } = buildColumnIndex(headers, mapeo);
  return rows.map((row) => ({
    rfc: rfcIdx >= 0 ? (row[rfcIdx] ?? '').trim().toUpperCase() : '',
    contratoFecha: contratoIdx >= 0 ? (row[contratoIdx] ?? '').trim() || null : null,
    imssFecha: imssIdx >= 0 ? (row[imssIdx] ?? '').trim() || null : null,
  }));
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** true si year-month-day es una fecha real del calendario (rechaza cosas como 31 de febrero). */
function esFechaValida(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Interpreta una fecha en cualquiera de los formatos comunes que puede traer
 * un archivo de Aspel: ISO (ya normalizado por el parser de xlsx), DD/MM/YYYY
 * o MM/DD/YYYY (con / o -, asumiendo día primero salvo que el primer número
 * no pueda ser día), o un serial de fecha de Excel como texto plano. Regresa
 * null si no se pudo interpretar — el dato crudo se sigue usando como
 * evidencia de que el campo aplica, solo que sin fecha para guardar.
 */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return esFechaValida(Number(y), Number(mo), Number(d)) ? `${y}-${mo}-${d}` : null;
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    const year = Number(m[3]);
    if (day > 12 && month <= 12) {
      // ya viene día/mes
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day]; // veía mes/día
    }
    if (!esFechaValida(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    const date = new Date(EXCEL_EPOCH_MS + serial * 86400000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  return null;
}
