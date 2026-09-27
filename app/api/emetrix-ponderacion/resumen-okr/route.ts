import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchResumenOkr } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/resumen-okr?marcaId=... — traduce los 3 KR
// del sondeo de Emetrix a las 5 filas del OKR oficial "Ciclo de vida del
// promotor" para esta cuenta.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  return NextResponse.json(await fetchResumenOkr(marcaId));
}
