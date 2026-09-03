import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { fetchPromotorMateriales, setPromotorMaterial } from '@/lib/materiales';

export const dynamic = 'force-dynamic';

// GET  /api/promotores/[id]/materiales -> checklist completo (13 artículos + estado) de un promotor
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { id } = await params;
  return NextResponse.json(await fetchPromotorMateriales(id));
}

// PATCH /api/promotores/[id]/materiales { materialId, entregado } -> marca/desmarca un artículo
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const materialId = typeof body.materialId === 'string' ? body.materialId : '';
  const entregado = typeof body.entregado === 'boolean' ? body.entregado : null;

  if (!materialId || entregado === null) {
    return NextResponse.json({ error: 'materialId y entregado son obligatorios.' }, { status: 400 });
  }

  await setPromotorMaterial(id, materialId, entregado);
  return NextResponse.json(await fetchPromotorMateriales(id));
}
