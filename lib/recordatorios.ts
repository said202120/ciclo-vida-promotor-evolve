// Recordatorio simple y visible en el Dashboard (no un correo — eso ya lo
// cubre lib/alerts.ts con su propio disparo del día exacto). Este vive todo
// el mes en que el promotor cumple 1 mes de ingreso, para que un gerente que
// no revisa el tablero justo ese día no se lo pierda. Siempre relativo a
// "hoy" (el mes calendario real), sin importar qué mes esté viendo en el
// selector del tablero — es un pendiente de ahora mismo, no un histórico.

import { sql } from '@vercel/postgres';
import type { RecordatorioMateriales } from './types';

export async function fetchRecordatoriosMateriales(): Promise<RecordatorioMateriales[]> {
  const { rows } = await sql.query(
    `select id, nombre, to_char(fecha_ingreso, 'YYYY-MM-DD') as fecha_ingreso
     from promotores
     where date_trunc('month', fecha_ingreso + interval '1 month') = date_trunc('month', current_date)
     order by fecha_ingreso, nombre`
  );
  return rows.map((r) => ({
    promotorId: r.id as string,
    nombre: r.nombre as string,
    fechaIngreso: r.fecha_ingreso as string,
  }));
}
