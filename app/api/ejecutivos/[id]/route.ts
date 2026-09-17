import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { deleteEjecutivo, renameEjecutivo } from '@/lib/marcas';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre) {
    return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
  }

  await renameEjecutivo(id, nombre);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  await deleteEjecutivo(id);
  return NextResponse.json({ ok: true });
}
