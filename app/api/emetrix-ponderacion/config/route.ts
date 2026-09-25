import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchIncluyeCelularConfig } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/config?marcaId=... — si la cuenta ya tiene
// guardado si incluye celular (Materiales), para no volver a preguntarlo.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  return NextResponse.json({ incluyeCelular: await fetchIncluyeCelularConfig(marcaId) });
}
