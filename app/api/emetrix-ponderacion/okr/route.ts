import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { esPeriodoValido, fetchResultadoOkrCuenta, periodoActual } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/okr?marcaId=...&periodo=YYYY-MM — árbol OKR →
// KR → KPI de una cuenta EN ESE PERIODO, espejo del OKR oficial "Ciclo de
// vida del promotor". `periodo` default al mes actual si no se manda.
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

  return NextResponse.json(await fetchResultadoOkrCuenta(marcaId, periodo));
}
