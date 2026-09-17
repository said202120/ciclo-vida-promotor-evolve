import { NextResponse } from 'next/server';
import { fetchEncuestaPorCodigo, guardarRespuestaEncuesta } from '@/lib/encuestas';
import type { EncuestaRespuestaPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CAMPOS_BOOLEANOS = [
  'contratoReportado',
  'imssReportado',
  'cartaReportada',
  'credencialReportada',
  'usuarioEmetrixReportado',
] as const;

// GET /api/encuestas/[codigo] — encuesta "Mesa de Control" (bloques 1 y 2).
// Público, sin sesión: el código en la URL es el control de acceso.
export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const encuesta = await fetchEncuestaPorCodigo(codigo);
  if (!encuesta) {
    return NextResponse.json({ error: 'Este link no es válido.' }, { status: 404 });
  }
  return NextResponse.json(encuesta);
}

// POST /api/encuestas/[codigo] — guarda la respuesta del promotor. Público,
// sin sesión, mismo control de acceso vía código.
export async function POST(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const body = await request.json().catch(() => ({}));

  const marca = typeof body.marca === 'string' ? body.marca.trim() : '';
  const puesto = typeof body.puesto === 'string' ? body.puesto.trim() : '';

  if (!marca || !puesto) {
    return NextResponse.json({ error: 'Marca y puesto son obligatorios.' }, { status: 400 });
  }
  for (const campo of CAMPOS_BOOLEANOS) {
    if (typeof body[campo] !== 'boolean') {
      return NextResponse.json({ error: 'Responde todas las preguntas de Sí/No antes de enviar.' }, { status: 400 });
    }
  }

  const payload: EncuestaRespuestaPayload = {
    marca,
    puesto,
    contratoReportado: body.contratoReportado,
    imssReportado: body.imssReportado,
    cartaReportada: body.cartaReportada,
    credencialReportada: body.credencialReportada,
    usuarioEmetrixReportado: body.usuarioEmetrixReportado,
  };

  const ok = await guardarRespuestaEncuesta(codigo, payload);
  if (!ok) {
    return NextResponse.json({ error: 'Este link no es válido.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
