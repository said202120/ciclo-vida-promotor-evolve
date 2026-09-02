import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

// GET /api/cierres            -> lista los meses que ya tienen cierre
// GET /api/cierres?mes=YYYY-MM -> filas crudas del cierre de ese mes (vacío si no está cerrado)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');

  if (mes) {
    const { rows } = await sql.query(
      'SELECT kpi_id, numerador, denominador, porcentaje, cerrado_en FROM cierres_mensuales WHERE mes = $1 ORDER BY kpi_id',
      [mes]
    );
    return NextResponse.json({ mes, closed: rows.length > 0, rows });
  }

  const { rows } = await sql.query('SELECT DISTINCT mes FROM cierres_mensuales ORDER BY mes');
  return NextResponse.json({ meses: rows.map((r) => r.mes as string) });
}
