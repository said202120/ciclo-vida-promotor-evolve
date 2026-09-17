import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createEjecutivo } from '@/lib/marcas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  if (!nombre || !marcaId) {
    return NextResponse.json({ error: 'Nombre y marca son obligatorios.' }, { status: 400 });
  }

  try {
    const ejecutivo = await createEjecutivo(nombre, marcaId);
    return NextResponse.json(ejecutivo, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Ese ejecutivo ya existe en esa marca.' }, { status: 409 });
    }
    throw err;
  }
}
