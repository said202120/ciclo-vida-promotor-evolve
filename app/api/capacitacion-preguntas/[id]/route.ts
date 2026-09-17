import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { deleteCapacitacionPregunta, updateCapacitacionPregunta } from '@/lib/capacitaciones';
import type { CapacitacionPreguntaTipo } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TIPOS_VALIDOS: CapacitacionPreguntaTipo[] = ['texto', 'supervisor_directo', 'coordinador_cuenta'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch: { texto?: string; tipo?: CapacitacionPreguntaTipo } = {};

  if (typeof body.texto === 'string') {
    const texto = body.texto.trim();
    if (!texto) return NextResponse.json({ error: 'El texto de la pregunta no puede quedar vacío.' }, { status: 400 });
    patch.texto = texto;
  }
  if (typeof body.tipo === 'string') {
    if (!TIPOS_VALIDOS.includes(body.tipo as CapacitacionPreguntaTipo)) {
      return NextResponse.json({ error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.` }, { status: 400 });
    }
    patch.tipo = body.tipo as CapacitacionPreguntaTipo;
  }
  if (patch.texto === undefined && patch.tipo === undefined) {
    return NextResponse.json({ error: 'No hay campos válidos para actualizar.' }, { status: 400 });
  }

  await updateCapacitacionPregunta(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const { id } = await params;
  await deleteCapacitacionPregunta(id);
  return NextResponse.json({ ok: true });
}
