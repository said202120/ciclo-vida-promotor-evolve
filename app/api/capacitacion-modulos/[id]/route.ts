import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { deleteCapacitacionModulo, updateCapacitacionModulo } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch: { nombre?: string; descripcion?: string | null; umbralAprobacion?: number } = {};

  if (typeof body.nombre === 'string') {
    const nombre = body.nombre.trim();
    if (!nombre) return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 });
    patch.nombre = nombre;
  }
  if ('descripcion' in body) {
    patch.descripcion = typeof body.descripcion === 'string' && body.descripcion.trim() ? body.descripcion.trim() : null;
  }
  if (typeof body.umbralAprobacion === 'number') {
    if (body.umbralAprobacion < 1 || body.umbralAprobacion > 100) {
      return NextResponse.json({ error: 'El umbral de aprobación debe estar entre 1 y 100.' }, { status: 400 });
    }
    patch.umbralAprobacion = Math.round(body.umbralAprobacion);
  }

  await updateCapacitacionModulo(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  await deleteCapacitacionModulo(id);
  return NextResponse.json({ ok: true });
}
