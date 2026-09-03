import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireSession } from '@/lib/auth';
import { mensajeMes1, mensajeMes2, type AlertaTipo } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const MENSAJES: Record<AlertaTipo, (nombre: string) => string> = {
  mes1: mensajeMes1,
  mes2: mensajeMes2,
};

// GET /api/alertas — alertas de los últimos 14 días que siguen "activas"
// (el promotor todavía no tiene materiales marcados como entregados).
// Alimenta el banner del tablero.
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  // "Activa" = el promotor todavía no tiene los 13 artículos del catálogo
  // marcados como entregados (mismo criterio de "completo" que el KPI 2.1).
  const { rows } = await sql.query(
    `SELECT ae.promotor_id, ae.tipo, ae.enviada_en, p.nombre
     FROM alertas_enviadas ae
     JOIN promotores p ON p.id = ae.promotor_id
     CROSS JOIN (SELECT count(*)::int AS total FROM materiales_catalogo) cat
     LEFT JOIN (
       SELECT promotor_id, count(*) FILTER (WHERE entregado) AS entregados
       FROM promotor_materiales
       GROUP BY promotor_id
     ) pm ON pm.promotor_id = p.id
     WHERE ae.enviada_en >= now() - interval '14 days'
       AND coalesce(pm.entregados, 0) < cat.total
     ORDER BY ae.enviada_en DESC`
  );

  const alertas = rows.map((r) => ({
    promotorId: r.promotor_id as string,
    nombre: r.nombre as string,
    tipo: r.tipo as AlertaTipo,
    enviadaEn: r.enviada_en as string,
    mensaje: MENSAJES[r.tipo as AlertaTipo](r.nombre as string),
  }));

  return NextResponse.json(alertas);
}
