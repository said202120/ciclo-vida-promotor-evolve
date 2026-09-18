import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createCapacitacionPregunta } from '@/lib/capacitaciones';
import type { CapacitacionPreguntaTipo } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TIPOS_VALIDOS: CapacitacionPreguntaTipo[] = ['texto', 'supervisor_directo', 'coordinador_cuenta'];

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const moduloId = typeof body.moduloId === 'string' ? body.moduloId : '';
  const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
  if (!moduloId || !texto) {
    return NextResponse.json({ error: 'Módulo y texto de la pregunta son obligatorios.' }, { status: 400 });
  }
  const tipo = typeof body.tipo === 'string' ? body.tipo : 'texto';
  if (!TIPOS_VALIDOS.includes(tipo as CapacitacionPreguntaTipo)) {
    return NextResponse.json({ error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.` }, { status: 400 });
  }
  const campoAbiertoLabel = typeof body.campoAbiertoLabel === 'string' && body.campoAbiertoLabel.trim() ? body.campoAbiertoLabel.trim() : null;
  const califica = typeof body.califica === 'boolean' ? body.califica : true;
  const multiSelect = typeof body.multiSelect === 'boolean' ? body.multiSelect : false;

  const pregunta = await createCapacitacionPregunta(
    moduloId,
    texto,
    tipo as CapacitacionPreguntaTipo,
    campoAbiertoLabel,
    califica,
    multiSelect
  );
  return NextResponse.json(pregunta, { status: 201 });
}
