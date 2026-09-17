import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { getOrCreateEncuestaLink, type EncuestaTipo } from '@/lib/encuestas';

export const dynamic = 'force-dynamic';

const TIPOS_VALIDOS: EncuestaTipo[] = ['mesa_control', 'materiales'];

// GET /api/promotores/[id]/encuesta-link?tipo=mesa_control|materiales —
// devuelve (o crea) el código único de esa encuesta para ese promotor, para
// que el ejecutivo lo copie y se lo mande.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;

  const tipo = new URL(request.url).searchParams.get('tipo');
  if (!tipo || !TIPOS_VALIDOS.includes(tipo as EncuestaTipo)) {
    return NextResponse.json({ error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.` }, { status: 400 });
  }

  const { id } = await params;
  const codigo = await getOrCreateEncuestaLink(id, tipo as EncuestaTipo);
  return NextResponse.json({ codigo });
}
