import { NextResponse } from 'next/server';
import { db } from '@vercel/postgres';
import { requireDashboard } from '@/lib/auth';
import { fetchRoster } from '@/lib/roster';
import { fetchModulos } from '@/lib/modulos';
import { computeDashboard, dashboardToCierreRows } from '@/lib/calc';

export const dynamic = 'force-dynamic';

const MES_RE = /^\d{4}-\d{2}$/;

// POST /api/cierres/cerrar { mes: 'YYYY-MM' }
// Congela el resultado del mes: calcula en vivo con la lógica de cohortes
// y lo escribe (upsert) en cierres_mensuales. A partir de ahí, GET /api/kpis
// para ese mes deja de recalcular y lee estas filas fijas.
export async function POST(request: Request) {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const mes = typeof body.mes === 'string' ? body.mes : '';
  if (!MES_RE.test(mes)) {
    return NextResponse.json({ error: 'mes debe tener formato YYYY-MM.' }, { status: 400 });
  }

  const [roster, modulos] = await Promise.all([fetchRoster(), fetchModulos()]);
  const dashboard = computeDashboard(roster, modulos, mes);
  const cierreRows = dashboardToCierreRows(dashboard);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const row of cierreRows) {
      await client.query(
        `INSERT INTO cierres_mensuales (mes, kpi_id, numerador, denominador, porcentaje)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (mes, kpi_id) DO UPDATE SET
           numerador = EXCLUDED.numerador,
           denominador = EXCLUDED.denominador,
           porcentaje = EXCLUDED.porcentaje,
           cerrado_en = now()`,
        [mes, row.kpiId, row.numerador, row.denominador, row.porcentaje]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return NextResponse.json({ ...dashboard, closed: true });
}
