import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { esPeriodoValido, fetchResultadoOkrTodasCuentas, periodoActual } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/okr/todas?periodo=YYYY-MM — árbol OKR → KR →
// KPI de cada cuenta que ya tiene al menos una carga EN ESE PERIODO. `periodo`
// default al mes actual si no se manda.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const periodo = new URL(request.url).searchParams.get('periodo') ?? periodoActual();
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  return NextResponse.json(await fetchResultadoOkrTodasCuentas(periodo));
}
