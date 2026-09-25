import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchVistaCruzada } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/vista-cruzada?marcaId=... — un renglón por
// promotor del padrón con su estado en cada uno de los 3 KR. Vacío si la
// cuenta no tiene padrón cargado.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  return NextResponse.json(await fetchVistaCruzada(marcaId));
}
