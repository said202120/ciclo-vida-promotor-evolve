// Parser flexible del archivo de Aspel: no asumimos columnas fijas, solo que
// la primera fila con contenido son los encabezados. Acepta .xlsx/.xlsm
// (ExcelJS) y .csv (PapaParse). .xls binario (Excel 97-2003) no es legible
// por ExcelJS, así que se rechaza con un mensaje claro en vez de fallar oscuro.

import { sql } from '@vercel/postgres';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { parseFlexibleDate, type RegistroExtraido } from './import-shared';
import { CAMPOS_PERMITIDOS, campoPermitido, type RolImportador } from './import-permisos';
import type {
  ImportAplicarResultado,
  ImportCampo,
  ImportLogEntry,
  ImportMapeo,
  PromotorParaImportar,
} from './types';

const MAX_ROWS = 5000;
const CAMPOS_VALIDOS: ImportCampo[] = [
  'rfc',
  'contratoFecha',
  'imssFecha',
  'cartaFecha',
  'emetrixFecha',
  'ignorar',
];

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
// / fecha de IMSS / ignorar) se guarda por rol de captura, para proponerlo la
// próxima vez que ese rol suba un archivo con la misma estructura de columnas.

export async function fetchImportConfig(rol: RolImportador): Promise<ImportMapeo> {
  const { rows } = await sql.query('select mapeo from importaciones_config where rol = $1', [rol]);
  const raw = rows[0]?.mapeo;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const clean: ImportMapeo = {};
  for (const [header, campo] of Object.entries(raw as Record<string, unknown>)) {
    if (CAMPOS_VALIDOS.includes(campo as ImportCampo) && campoPermitido(rol, campo as ImportCampo)) {
      clean[header] = campo as ImportCampo;
    }
  }
  return clean;
}

export async function saveImportConfig(rol: RolImportador, mapeo: ImportMapeo): Promise<void> {
  await sql.query('update importaciones_config set mapeo = $2::jsonb, updated_at = now() where rol = $1', [
    rol,
    JSON.stringify(mapeo),
  ]);
}

// Qué columnas booleana/fecha corresponden a cada campo de fecha del importador.
const CAMPO_A_COLUMNAS: Record<'contratoFecha' | 'imssFecha' | 'cartaFecha' | 'emetrixFecha', { bool: string; fecha: string }> = {
  contratoFecha: { bool: 'contrato', fecha: 'fecha_contrato' },
  imssFecha: { bool: 'imss', fecha: 'fecha_imss' },
  cartaFecha: { bool: 'carta', fecha: 'fecha_carta' },
  emetrixFecha: { bool: 'usuario', fecha: 'fecha_usuario' },
};

type DatosRegistro = Record<keyof typeof CAMPO_A_COLUMNAS, string | null>;

// Aplica los cambios detectados: cruza por RFC contra el padrón actual y
// marca el booleano correspondiente en true (con su fecha si se pudo
// interpretar) solo en los promotores que hicieron match. Nunca crea
// promotores nuevos ni regresa un booleano ya en true a false. Cada corrida
// queda en importaciones_log, con match o sin match.
export async function aplicarImportacion(
  registros: RegistroExtraido[],
  usuarioId: string,
  rol: RolImportador
): Promise<ImportAplicarResultado> {
  // El rol acota qué campos puede escribir, sin importar lo que haya mandado
  // el cliente: mesa_control nunca escribe IMSS, nomina nunca escribe contrato/carta/Emetrix.
  const permitidos = new Set(CAMPOS_PERMITIDOS[rol]);

  // Se agrupa por RFC por si el archivo trae varias filas del mismo promotor;
  // el dato más reciente que no venga vacío gana.
  const porRfc = new Map<string, DatosRegistro>();
  for (const r of registros) {
    const rfc = r.rfc.trim().toUpperCase();
    if (!rfc) continue;
    const prev = porRfc.get(rfc) ?? {
      contratoFecha: null,
      imssFecha: null,
      cartaFecha: null,
      emetrixFecha: null,
    };
    porRfc.set(rfc, {
      contratoFecha: permitidos.has('contratoFecha') ? (r.contratoFecha ?? prev.contratoFecha) : null,
      imssFecha: permitidos.has('imssFecha') ? (r.imssFecha ?? prev.imssFecha) : null,
      cartaFecha: permitidos.has('cartaFecha') ? (r.cartaFecha ?? prev.cartaFecha) : null,
      emetrixFecha: permitidos.has('emetrixFecha') ? (r.emetrixFecha ?? prev.emetrixFecha) : null,
    });
  }

  const rfcs = [...porRfc.keys()];
  if (rfcs.length === 0) {
    await sql.query('insert into importaciones_log (usuario_id, actualizados, no_encontrados) values ($1, 0, 0)', [
      usuarioId,
    ]);
    return { recibidos: 0, actualizados: 0, sinMatch: [] };
  }

  const { rows } = await sql.query('select id, rfc from promotores where upper(rfc) = any($1::text[])', [rfcs]);
  const idPorRfc = new Map<string, string>();
  for (const row of rows as Array<{ id: string; rfc: string }>) {
    idPorRfc.set((row.rfc ?? '').toUpperCase(), row.id);
  }

  let actualizados = 0;
  const sinMatch: string[] = [];

  for (const rfc of rfcs) {
    const promotorId = idPorRfc.get(rfc);
    if (!promotorId) {
      sinMatch.push(rfc);
      continue;
    }

    const datos = porRfc.get(rfc)!;
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    for (const campo of Object.keys(CAMPO_A_COLUMNAS) as Array<keyof typeof CAMPO_A_COLUMNAS>) {
      const valorCrudo = datos[campo];
      if (!valorCrudo) continue;
      const { bool, fecha: columnaFecha } = CAMPO_A_COLUMNAS[campo];
      sets.push(`${bool} = true`);
      const fecha = parseFlexibleDate(valorCrudo);
      if (fecha) {
        sets.push(`${columnaFecha} = $${i++}`);
        values.push(fecha);
      }
    }

    if (sets.length === 0) continue; // hizo match pero la fila no traía nada que aplicar

    values.push(promotorId);
    try {
      await sql.query(`update promotores set ${sets.join(', ')} where id = $${i}`, values);
      actualizados++;
    } catch {
      // Un error puntual (p. ej. de conexión) no debe tumbar el resto del lote.
      sinMatch.push(rfc);
    }
  }

  await sql.query('insert into importaciones_log (usuario_id, actualizados, no_encontrados) values ($1, $2, $3)', [
    usuarioId,
    actualizados,
    sinMatch.length,
  ]);

  return { recibidos: rfcs.length, actualizados, sinMatch };
}

/** Vista mínima del padrón (id, nombre, rfc, imss) para que el importador cruce por RFC sin exponer todo el tablero. */
export async function fetchPromotoresParaImportar(): Promise<PromotorParaImportar[]> {
  const { rows } = await sql.query(
    `select id, nombre, rfc, imss, to_char(fecha_imss, 'YYYY-MM-DD') as fecha_imss from promotores`
  );
  return rows.map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    rfc: (r.rfc as string | null) ?? null,
    imss: r.imss as boolean,
    fechaImss: (r.fecha_imss as string | null) ?? null,
  }));
}

/** Historial de corridas del importador, más reciente primero. */
export async function fetchImportLog(limit = 10): Promise<ImportLogEntry[]> {
  const { rows } = await sql.query(
    `select il.id, il.ejecutada_en, il.actualizados, il.no_encontrados, u.nombre as usuario_nombre
     from importaciones_log il
     left join usuarios u on u.id = il.usuario_id
     order by il.ejecutada_en desc
     limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id as string,
    fecha: new Date(r.ejecutada_en as string).toISOString(),
    actualizados: Number(r.actualizados),
    noEncontrados: Number(r.no_encontrados),
    usuarioNombre: (r.usuario_nombre as string | null) ?? null,
  }));
}
