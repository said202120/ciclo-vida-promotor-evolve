import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchResultadoCuenta } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/resultado?marcaId=... — la carga más reciente
// de cada KR para esa cuenta + su peso, con el total ponderado del OKR.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  return NextResponse.json(await fetchResultadoCuenta(marcaId));
}
