import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { deleteMarca, renameMarca } from '@/lib/marcas';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre) {
    return NextResponse.json({ error: 'El nombre de la marca es obligatorio.' }, { status: 400 });
  }

  try {
    await renameMarca(id, nombre);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una marca con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}

// DELETE /api/marcas/[id] — borra la marca y, en cascada, sus supervisores y ejecutivos.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  await deleteMarca(id);
  return NextResponse.json({ ok: true });
}
