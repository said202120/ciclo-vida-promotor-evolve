import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { esPeriodoValido, fetchVistaCruzada, periodoActual } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/vista-cruzada?marcaId=...&periodo=YYYY-MM —
// un renglón por promotor del padrón con su estado en cada uno de los 3 KR
// EN ESE PERIODO. Vacío si la cuenta no tiene padrón cargado. `periodo`
// default al mes actual si no se manda.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const marcaId = url.searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }
  const periodo = url.searchParams.get('periodo') ?? periodoActual();
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  return NextResponse.json(await fetchVistaCruzada(marcaId, periodo));
}
