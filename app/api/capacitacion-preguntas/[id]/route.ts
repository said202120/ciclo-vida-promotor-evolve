import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { deleteCapacitacionPregunta, updateCapacitacionPregunta } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
  if (!texto) {
    return NextResponse.json({ error: 'El texto de la pregunta no puede quedar vacío.' }, { status: 400 });
  }

  await updateCapacitacionPregunta(id, texto);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  await deleteCapacitacionPregunta(id);
  return NextResponse.json({ ok: true });
}
