import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createCapacitacionOpcion } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const preguntaId = typeof body.preguntaId === 'string' ? body.preguntaId : '';
  const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
  if (!preguntaId || !texto) {
    return NextResponse.json({ error: 'Pregunta y texto de la opción son obligatorios.' }, { status: 400 });
  }

  try {
    const opcion = await createCapacitacionOpcion(preguntaId, texto);
    return NextResponse.json(opcion, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo crear la opción.' }, { status: 400 });
  }
}
