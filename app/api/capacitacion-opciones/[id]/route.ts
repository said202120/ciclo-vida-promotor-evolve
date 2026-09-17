import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { deleteCapacitacionOpcion, marcarOpcionCorrecta, updateCapacitacionOpcionTexto } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

// PATCH body: { texto } para renombrar, o { correcta: true, preguntaId } para
// marcarla como la única correcta de su pregunta (desmarca a las demás).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.correcta === true) {
    const preguntaId = typeof body.preguntaId === 'string' ? body.preguntaId : '';
    if (!preguntaId) {
      return NextResponse.json({ error: 'Falta preguntaId para marcar la opción correcta.' }, { status: 400 });
    }
    await marcarOpcionCorrecta(preguntaId, id);
    return NextResponse.json({ ok: true });
  }

  if (typeof body.texto === 'string') {
    const texto = body.texto.trim();
    if (!texto) return NextResponse.json({ error: 'El texto de la opción no puede quedar vacío.' }, { status: 400 });
    await updateCapacitacionOpcionTexto(id, texto);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'No hay campos válidos para actualizar.' }, { status: 400 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  await deleteCapacitacionOpcion(id);
  return NextResponse.json({ ok: true });
}
