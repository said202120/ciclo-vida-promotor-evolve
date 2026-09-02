import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

// GET /api/meses
// Rango navegable del tablero: desde el primer ingreso registrado (o el mes
// actual, si el padrón está vacío) hasta el mes actual real, sin huecos.
// Cualquier mes con cierre ya existente también se incluye, aunque quede
// fuera de ese rango (caso raro, pero mantiene el historial visible).
export async function GET() {
  const [{ rows: cierreRows }, { rows: rosterRows }] = await Promise.all([
    sql.query('SELECT DISTINCT mes FROM cierres_mensuales'),
    sql.query("SELECT to_char(min(fecha_ingreso), 'YYYY-MM') as min_mes FROM promotores"),
  ]);

  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const months = new Set<string>([current]);
  for (const r of cierreRows) months.add(r.mes as string);
  const minMes = rosterRows[0]?.min_mes as string | null;
  if (minMes) months.add(minMes);

  const sorted = Array.from(months).sort();
  const [startY, startM] = sorted[0].split('-').map(Number);
  const [endY, endM] = sorted[sorted.length - 1].split('-').map(Number);

  const filled: string[] = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    filled.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return NextResponse.json({ meses: filled, actual: current });
}
