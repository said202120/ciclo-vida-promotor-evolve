import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchDetalleCarga } from '@/lib/emetrix-ponderacion';
import type { EmetrixKr } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];

// GET /api/emetrix-ponderacion/detalle?marcaId=...&kr=... — detalle por
// promotor de la carga más reciente de ese KR para esa cuenta.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const marcaId = url.searchParams.get('marcaId');
  const kr = url.searchParams.get('kr');
  if (!marcaId || !kr || !KRS_VALIDOS.includes(kr as EmetrixKr)) {
    return NextResponse.json({ error: 'Faltan marcaId y kr, o kr es inválido.' }, { status: 400 });
  }

  const detalle = await fetchDetalleCarga(marcaId, kr as EmetrixKr);
  return NextResponse.json(detalle);
}
