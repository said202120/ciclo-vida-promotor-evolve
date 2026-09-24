import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { updatePesoKr } from '@/lib/emetrix-ponderacion';
import type { EmetrixKr } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];

// PATCH /api/emetrix-ponderacion/pesos — cambia el peso de un KR para una
// cuenta (33.3% por default si nunca se ha tocado).
export async function PATCH(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  const kr = typeof body.kr === 'string' ? body.kr : '';
  const peso = typeof body.peso === 'number' ? body.peso : null;

  if (!marcaId || !KRS_VALIDOS.includes(kr as EmetrixKr) || peso === null || peso < 0 || peso > 100) {
    return NextResponse.json({ error: 'Datos inválidos: marcaId, kr y peso (0-100) son obligatorios.' }, { status: 400 });
  }

  await updatePesoKr(marcaId, kr as EmetrixKr, peso);
  return NextResponse.json({ ok: true });
}
