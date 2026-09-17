// Selección y mapeo de la tabla `promotores` (snake_case en DB -> camelCase en la API).
// fecha_ingreso se lee vía to_char para evitar que el driver de Postgres
// reinterprete la fecha con la zona horaria del proceso. El resumen de
// materiales (entregados/total) se calcula aquí con un join contra
// materiales_catalogo/promotor_materiales — no vive como columna propia.

import { sql } from '@vercel/postgres';
import type { Promotor } from './types';

const ROSTER_SELECT = `
  select
    p.id, p.nombre, p.rfc, to_char(p.fecha_ingreso, 'YYYY-MM-DD') as fecha_ingreso,
    p.carta, p.usuario, p.contrato, p.imss, p.mod1, p.mod3, p.mod6, p.mod12,
    p.created_at, p.updated_at,
    coalesce(pm.entregados, 0)::int as materiales_entregados,
    cat.total::int as materiales_total
  from promotores p
  cross join (select count(*)::int as total from materiales_catalogo) cat
  left join (
    select promotor_id, count(*) filter (where entregado) as entregados
    from promotor_materiales
    group by promotor_id
  ) pm on pm.promotor_id = p.id
`;

type PromotorRow = {
  id: string;
  nombre: string;
  rfc: string | null;
  fecha_ingreso: string | null;
  carta: boolean;
  usuario: boolean;
  contrato: boolean;
  imss: boolean;
  mod1: boolean;
  mod3: boolean;
  mod6: boolean;
  mod12: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  materiales_entregados: number;
  materiales_total: number;
};

function rowToApi(row: PromotorRow): Promotor {
  return {
    id: row.id,
    nombre: row.nombre,
    rfc: row.rfc,
    fechaIngreso: row.fecha_ingreso,
    carta: row.carta,
    usuario: row.usuario,
    contrato: row.contrato,
    imss: row.imss,
    mod1: row.mod1,
    mod3: row.mod3,
    mod6: row.mod6,
    mod12: row.mod12,
    materialesEntregados: Number(row.materiales_entregados),
    materialesTotal: Number(row.materiales_total),
  };
}

export async function fetchAllPromotores(): Promise<Promotor[]> {
  const { rows } = await sql.query(`${ROSTER_SELECT} order by p.fecha_ingreso, p.nombre`);
  return (rows as PromotorRow[]).map(rowToApi);
}

export async function fetchPromotorById(id: string): Promise<Promotor | null> {
  const { rows } = await sql.query(`${ROSTER_SELECT} where p.id = $1`, [id]);
  return rows[0] ? rowToApi(rows[0] as PromotorRow) : null;
}
