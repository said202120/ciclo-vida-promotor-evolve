import { NextResponse } from 'next/server';
import {
  RespuestasInvalidasError,
  fetchCapacitacionPublicaPorCodigo,
  guardarRespuestaCapacitacion,
} from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

// GET /api/capacitaciones/[codigo] — examen de capacitación. Público, sin
// sesión: el código en la URL es el control de acceso.
export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const capacitacion = await fetchCapacitacionPublicaPorCodigo(codigo);
  if (!capacitacion) {
    return NextResponse.json({ error: 'Este link no es válido.' }, { status: 404 });
  }
  return NextResponse.json(capacitacion);
}

// POST /api/capacitaciones/[codigo] — envía y califica el intento. Público,
// sin sesión, mismo control de acceso vía código. Reintentos ilimitados: el
// envío sobreescribe el resultado anterior de ese módulo.
export async function POST(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const body = await request.json().catch(() => ({}));

  const respuestas = Array.isArray(body.respuestas) ? body.respuestas : null;
  if (
    !respuestas ||
    !respuestas.every(
      (r: unknown) =>
        r &&
        typeof r === 'object' &&
        typeof (r as { preguntaId?: unknown }).preguntaId === 'string' &&
        typeof (r as { opcionId?: unknown }).opcionId === 'string'
    )
  ) {
    return NextResponse.json({ error: 'Respuestas inválidas.' }, { status: 400 });
  }

  const respuestasAbiertasRaw = Array.isArray(body.respuestasAbiertas) ? body.respuestasAbiertas : [];
  if (
    !respuestasAbiertasRaw.every(
      (r: unknown) =>
        r &&
        typeof r === 'object' &&
        typeof (r as { preguntaId?: unknown }).preguntaId === 'string' &&
        typeof (r as { texto?: unknown }).texto === 'string'
    )
  ) {
    return NextResponse.json({ error: 'Respuestas de campo abierto inválidas.' }, { status: 400 });
  }

  try {
    const resultado = await guardarRespuestaCapacitacion(codigo, respuestas, respuestasAbiertasRaw);
    if (!resultado) {
      return NextResponse.json({ error: 'Este link no es válido.' }, { status: 404 });
    }
    return NextResponse.json(resultado);
  } catch (err) {
    if (err instanceof RespuestasInvalidasError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
