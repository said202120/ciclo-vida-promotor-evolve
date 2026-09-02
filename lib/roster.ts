import { sql } from '@vercel/postgres';
import { PROMOTOR_SELECT_COLUMNS, promotorRowToApi, type PromotorRow } from './promotores';
import type { Promotor } from './types';

/** Padrón completo, usado por los endpoints de cálculo (kpis, cerrar). */
export async function fetchRoster(): Promise<Promotor[]> {
  const { rows } = await sql.query(`SELECT ${PROMOTOR_SELECT_COLUMNS} FROM promotores`);
  return (rows as PromotorRow[]).map(promotorRowToApi);
}
