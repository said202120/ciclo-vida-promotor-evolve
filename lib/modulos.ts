import { sql } from '@vercel/postgres';
import type { Modulos } from './types';

const DEFAULT_MODULOS: Modulos = { mod1: false, mod3: false, mod6: false, mod12: false, comprometidos: 0 };

/** Fila única (id=1) de módulos publicados — estado global, no por mes. */
export async function fetchModulos(): Promise<Modulos> {
  const { rows } = await sql.query(
    'SELECT mod1, mod3, mod6, mod12, comprometidos FROM modulos_publicados WHERE id = 1'
  );
  const row = rows[0];
  if (!row) return DEFAULT_MODULOS;
  return {
    mod1: row.mod1,
    mod3: row.mod3,
    mod6: row.mod6,
    mod12: row.mod12,
    comprometidos: Number(row.comprometidos),
  };
}
