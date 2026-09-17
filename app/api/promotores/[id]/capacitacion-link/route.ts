import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { getOrCreateCapacitacionLink } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

// GET /api/promotores/[id]/capacitacion-link?moduloId=... — devuelve (o
// crea) el código único del examen de ese módulo para ese promotor.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;

  const moduloId = new URL(request.url).searchParams.get('moduloId');
  if (!moduloId) {
    return NextResponse.json({ error: 'Falta moduloId.' }, { status: 400 });
  }

  const { id } = await params;
  const codigo = await getOrCreateCapacitacionLink(id, moduloId);
  return NextResponse.json({ codigo });
}
