// Parser flexible del archivo de Aspel: no asumimos columnas fijas, solo que
// la primera fila con contenido son los encabezados. Acepta .xlsx/.xlsm
// (ExcelJS) y .csv (PapaParse). .xls binario (Excel 97-2003) no es legible
// por ExcelJS, así que se rechaza con un mensaje claro en vez de fallar oscuro.

import { sql } from '@vercel/postgres';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { ImportCampo, ImportMapeo } from './types';

const MAX_ROWS = 5000;
const CAMPOS_VALIDOS: ImportCampo[] = ['rfc', 'contratoFecha', 'imssFecha', 'ignorar'];

function cellToDisplay(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text: string }>).map((t) => t.text).join('');
    }
    if ('result' in v) return cellToDisplay(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(value);
}

function extractHeaderAndRows(grid: string[][]): { headers: string[]; rows: string[][] } {
  const firstNonEmpty = grid.findIndex((row) => row.some((cell) => cell.trim() !== ''));
  if (firstNonEmpty === -1) {
    throw new Error('El archivo no tiene datos.');
  }
  const headerRow = grid[firstNonEmpty];
  const headers = headerRow.map((h, i) => (h.trim() ? h.trim() : `Columna ${i + 1}`));
  const rows = grid
    .slice(firstNonEmpty + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => headers.map((_, i) => (row[i] ?? '').trim()));
  return { headers, rows };
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  // Node y ExcelJS traen definiciones de Buffer ligeramente distintas entre sí
  // (typings), aunque el valor en tiempo de ejecución es el mismo Buffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('El archivo no tiene hojas.');
  const grid: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1); // values[0] siempre viene vacío
    grid.push(values.map(cellToDisplay));
  });
  return grid;
}

function parseCsv(buffer: Buffer): string[][] {
  const text = buffer.toString('utf8');
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (result.data.length === 0 && result.errors.length > 0) {
    throw new Error('No se pudo leer el CSV: ' + result.errors[0].message);
  }
  return result.data;
}

export async function parseSpreadsheet(
  buffer: Buffer,
  filename: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  let grid: string[][];
  if (ext === 'csv') {
    grid = parseCsv(buffer);
  } else if (ext === 'xlsx' || ext === 'xlsm') {
    grid = await parseXlsx(buffer);
  } else if (ext === 'xls') {
    throw new Error(
      'El formato .xls (Excel 97-2003) no se puede leer directamente. Guarda el archivo como .xlsx o .csv desde Excel y vuelve a subirlo.'
    );
  } else {
    throw new Error('Formato no soportado. Sube un archivo .xlsx o .csv.');
  }

  const { headers, rows } = extractHeaderAndRows(grid);
  if (rows.length === 0) {
    throw new Error('El archivo no tiene filas de datos debajo del encabezado.');
  }
  if (rows.length > MAX_ROWS) {
    throw new Error(`El archivo tiene ${rows.length} filas; el máximo soportado por ahora es ${MAX_ROWS}.`);
  }
  return { headers, rows };
}

// El mapeo de columnas (qué encabezado del archivo es RFC / fecha de contrato
// / fecha de IMSS / ignorar) se guarda en una sola fila para proponerlo la
// próxima vez que se suba un archivo con la misma estructura de columnas.

export async function fetchImportConfig(): Promise<ImportMapeo> {
  const { rows } = await sql.query('select mapeo from importaciones_config where id = 1');
  const raw = rows[0]?.mapeo;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const clean: ImportMapeo = {};
  for (const [header, campo] of Object.entries(raw as Record<string, unknown>)) {
    if (CAMPOS_VALIDOS.includes(campo as ImportCampo)) clean[header] = campo as ImportCampo;
  }
  return clean;
}

export async function saveImportConfig(mapeo: ImportMapeo): Promise<void> {
  await sql.query('update importaciones_config set mapeo = $1::jsonb, updated_at = now() where id = 1', [
    JSON.stringify(mapeo),
  ]);
}
