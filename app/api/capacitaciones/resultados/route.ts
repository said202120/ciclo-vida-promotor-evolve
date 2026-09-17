import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { fetchCapacitacionResultados } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

// GET /api/capacitaciones/resultados — resultado más reciente de cada
// promotor por módulo, para el badge de estatus en el padrón.
export async function GET() {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchCapacitacionResultados());
}
