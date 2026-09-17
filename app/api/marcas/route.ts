import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createMarca, fetchMarcasConDetalle } from '@/lib/marcas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireGerente();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchMarcasConDetalle());
}

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre) {
    return NextResponse.json({ error: 'El nombre de la marca es obligatorio.' }, { status: 400 });
  }

  try {
    const marca = await createMarca(nombre);
    return NextResponse.json(marca, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una marca con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}
