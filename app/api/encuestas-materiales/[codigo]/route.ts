import { NextResponse } from 'next/server';
import { fetchEncuestaMaterialesPorCodigo, guardarRespuestaMateriales } from '@/lib/encuestas';
import type { EncuestaMaterialesPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/encuestas-materiales/[codigo] — encuesta "Materiales" (/m/{codigo}).
// Público, sin sesión: el código en la URL es el control de acceso.
export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const encuesta = await fetchEncuestaMaterialesPorCodigo(codigo);
  if (!encuesta) {
    return NextResponse.json({ error: 'Este link no es válido.' }, { status: 404 });
  }
  return NextResponse.json(encuesta);
}

// POST /api/encuestas-materiales/[codigo] — guarda la respuesta. La pregunta
// de visibilidad es obligatoria; el checklist de materiales es opcional
// (puede venir vacío en la primera visita).
export async function POST(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.fechaEntregaComunicada !== 'boolean') {
    return NextResponse.json(
      { error: 'Responde si ya te dieron fecha de entrega antes de enviar.' },
      { status: 400 }
    );
  }
  const materiales = Array.isArray(body.materiales)
    ? body.materiales.filter((x: unknown): x is string => typeof x === 'string')
    : [];

  const payload: EncuestaMaterialesPayload = {
    fechaEntregaComunicada: body.fechaEntregaComunicada,
    materiales,
  };

  const ok = await guardarRespuestaMateriales(codigo, payload);
  if (!ok) {
    return NextResponse.json({ error: 'Este link no es válido.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
