import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchResultadoOkrCuenta } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/okr?marcaId=... — árbol OKR → KR → KPI de una
// cuenta, espejo del OKR oficial "Ciclo de vida del promotor".
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  return NextResponse.json(await fetchResultadoOkrCuenta(marcaId));
}
