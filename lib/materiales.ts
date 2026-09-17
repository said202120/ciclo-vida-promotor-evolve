import { sql } from '@vercel/postgres';
import type { MaterialCatalogoItem, MaterialCategoria, MaterialEstado, MaterialResumenItem } from './types';

export async function fetchCatalogo(): Promise<MaterialCatalogoItem[]> {
  const { rows } = await sql.query('SELECT id, categoria, nombre, orden FROM materiales_catalogo ORDER BY orden');
  return rows.map((r) => ({
    id: r.id as string,
    categoria: r.categoria as MaterialCategoria,
    nombre: r.nombre as string,
    orden: r.orden as number,
  }));
}

/** Checklist completo (13 artículos) de un promotor, con su estado de entrega. */
export async function fetchPromotorMateriales(promotorId: string): Promise<MaterialEstado[]> {
  const { rows } = await sql.query(
    `select mc.id as material_id, mc.categoria, mc.nombre, mc.orden,
            coalesce(pm.entregado, false) as entregado,
            to_char(pm.fecha_entrega, 'YYYY-MM-DD') as fecha_entrega
     from materiales_catalogo mc
     left join promotor_materiales pm on pm.material_id = mc.id and pm.promotor_id = $1
     order by mc.orden`,
    [promotorId]
  );
  return rows.map((r) => ({
    materialId: r.material_id as string,
    categoria: r.categoria as MaterialCategoria,
    nombre: r.nombre as string,
    orden: r.orden as number,
    entregado: r.entregado as boolean,
    fechaEntrega: (r.fecha_entrega as string | null) ?? null,
  }));
}

/** Conteo por artículo contra TODO el padrón (no la cohorte del mes) — desglose de solo lectura. */
export async function fetchMaterialesResumen(): Promise<MaterialResumenItem[]> {
  const { rows } = await sql.query(
    `select mc.id as material_id, mc.categoria, mc.nombre, mc.orden,
            coalesce(pm.entregados, 0)::int as entregados,
            (select count(*)::int from promotores) as total
     from materiales_catalogo mc
     left join (
       select material_id, count(*) filter (where entregado) as entregados
       from promotor_materiales
       group by material_id
     ) pm on pm.material_id = mc.id
     order by mc.orden`
  );
  return rows.map((r) => ({
    materialId: r.material_id as string,
    categoria: r.categoria as MaterialCategoria,
    nombre: r.nombre as string,
    orden: r.orden as number,
    entregados: r.entregados as number,
    total: r.total as number,
  }));
}

/** Marca (o desmarca) un artículo entregado para un promotor. fecha_entrega se limpia al desmarcar. */
export async function setPromotorMaterial(promotorId: string, materialId: string, entregado: boolean): Promise<void> {
  await sql.query(
    `insert into promotor_materiales (promotor_id, material_id, entregado, fecha_entrega)
     values ($1, $2, $3, case when $3 then current_date else null end)
     on conflict (promotor_id, material_id) do update set
       entregado = excluded.entregado,
       fecha_entrega = excluded.fecha_entrega`,
    [promotorId, materialId, entregado]
  );
}
