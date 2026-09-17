import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createCapacitacionModulo, fetchCapacitacionModulosConPreguntas } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

// GET /api/capacitacion-modulos — detalle completo (preguntas, opciones y
// cuál es la correcta) para /capacitaciones. Solo gerente.
export async function GET() {
  const auth = await requireGerente();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchCapacitacionModulosConPreguntas());
}

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const descripcion = typeof body.descripcion === 'string' && body.descripcion.trim() ? body.descripcion.trim() : null;
  if (!nombre) {
    return NextResponse.json({ error: 'El nombre del módulo es obligatorio.' }, { status: 400 });
  }

  const modulo = await createCapacitacionModulo(nombre, descripcion);
  return NextResponse.json(modulo, { status: 201 });
}
