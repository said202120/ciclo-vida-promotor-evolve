import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createCapacitacionPregunta } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const moduloId = typeof body.moduloId === 'string' ? body.moduloId : '';
  const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
  if (!moduloId || !texto) {
    return NextResponse.json({ error: 'Módulo y texto de la pregunta son obligatorios.' }, { status: 400 });
  }

  const pregunta = await createCapacitacionPregunta(moduloId, texto);
  return NextResponse.json(pregunta, { status: 201 });
}
