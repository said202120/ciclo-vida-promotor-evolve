import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { esPeriodoValido, fetchDetalleCarga, periodoActual } from '@/lib/emetrix-ponderacion';
import type { EmetrixKr } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];

// GET /api/emetrix-ponderacion/detalle?marcaId=...&kr=...&periodo=YYYY-MM —
// detalle por promotor de la carga más reciente de ese KR EN ESE PERIODO
// para esa cuenta. `periodo` default al mes actual si no se manda.
// Lectura: cualquier usuario autenticado.
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const marcaId = url.searchParams.get('marcaId');
  const kr = url.searchParams.get('kr');
  if (!marcaId || !kr || !KRS_VALIDOS.includes(kr as EmetrixKr)) {
    return NextResponse.json({ error: 'Faltan marcaId y kr, o kr es inválido.' }, { status: 400 });
  }
  const periodo = url.searchParams.get('periodo') ?? periodoActual();
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  const detalle = await fetchDetalleCarga(marcaId, kr as EmetrixKr, periodo);
  return NextResponse.json(detalle);
}
