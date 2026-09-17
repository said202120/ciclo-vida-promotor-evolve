import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { getOrCreateEncuestaLink } from '@/lib/encuestas';

export const dynamic = 'force-dynamic';

// GET /api/promotores/[id]/encuesta-link — devuelve (o crea) el código único
// de la encuesta pública para ese promotor, para que el ejecutivo lo copie y se lo mande.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;

  const { id } = await params;
  const codigo = await getOrCreateEncuestaLink(id);
  return NextResponse.json({ codigo });
}
