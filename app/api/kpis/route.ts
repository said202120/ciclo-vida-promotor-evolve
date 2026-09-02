import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { fetchRoster } from '@/lib/roster';
import { fetchModulos } from '@/lib/modulos';
import { computeDashboard, dashboardFromCierreRows } from '@/lib/calc';

export const dynamic = 'force-dynamic';

const MES_RE = /^\d{4}-\d{2}$/;

// GET /api/kpis?mes=YYYY-MM
// Endpoint principal del tablero: si el mes ya está cerrado, devuelve el
// resultado fijo guardado en cierres_mensuales; si no, lo calcula en vivo
// a partir del padrón y de modulos_publicados actuales.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');
  if (!mes || !MES_RE.test(mes)) {
    return NextResponse.json({ error: 'Parámetro mes es obligatorio (formato YYYY-MM).' }, { status: 400 });
  }

  const { rows } = await sql.query(
    'SELECT kpi_id, numerador, denominador, porcentaje FROM cierres_mensuales WHERE mes = $1',
    [mes]
  );

  if (rows.length > 0) {
    return NextResponse.json(dashboardFromCierreRows(mes, rows as Parameters<typeof dashboardFromCierreRows>[1]));
  }

  const [roster, modulos] = await Promise.all([fetchRoster(), fetchModulos()]);
  return NextResponse.json(computeDashboard(roster, modulos, mes));
}
