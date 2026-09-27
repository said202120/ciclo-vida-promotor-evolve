import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchResultadoOkrTodasCuentas } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/okr/todas — árbol OKR → KR → KPI de cada
// cuenta que ya tiene al menos una carga.
export async function GET() {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchResultadoOkrTodasCuentas());
}
