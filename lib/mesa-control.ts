// Checklist de Carta de ingreso / Usuario Emetrix para el rol mesa_control.
// No pasa por archivo ni importador: escribe directo sobre el promotor, igual
// que el padrón principal, pero acotado a estos dos campos únicamente.

import { sql } from '@vercel/postgres';
import type { IngresoMes } from './types';

const CAMPO_A_COLUMNAS: Record<'carta' | 'usuario', { bool: string; fecha: string }> = {
  carta: { bool: 'carta', fecha: 'fecha_carta' },
  usuario: { bool: 'usuario', fecha: 'fecha_usuario' },
};

/** Promotores "nuevos ingresos" del mes (fecha_ingreso dentro de ese mes) — mismo criterio que KR1. */
export async function fetchIngresosDelMes(mes: string): Promise<IngresoMes[]> {
  const { rows } = await sql.query(
    `select id, nombre, to_char(fecha_ingreso, 'YYYY-MM-DD') as fecha_ingreso, carta, usuario
     from promotores
     where to_char(fecha_ingreso, 'YYYY-MM') = $1
     order by fecha_ingreso, nombre`,
    [mes]
  );
  return rows.map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    fechaIngreso: r.fecha_ingreso as string,
    carta: r.carta as boolean,
    usuario: r.usuario as boolean,
  }));
}

/** Marca (o desmarca) carta/usuario Emetrix de un promotor. La fecha se limpia al desmarcar. */
export async function setIngresoCampo(promotorId: string, campo: 'carta' | 'usuario', valor: boolean): Promise<void> {
  const { bool, fecha } = CAMPO_A_COLUMNAS[campo];
  await sql.query(
    `update promotores set ${bool} = $1, ${fecha} = case when $1 then current_date else null end where id = $2`,
    [valor, promotorId]
  );
}
