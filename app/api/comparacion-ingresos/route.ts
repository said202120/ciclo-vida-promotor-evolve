import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { fetchComparacionIngresos } from '@/lib/encuestas';

export const dynamic = 'force-dynamic';

// GET /api/comparacion-ingresos?mes=YYYY-MM — sistema vs. lo que reportó
// el promotor en la encuesta, para los nuevos ingresos de ese mes.
export async function GET(request: Request) {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;

  const mes = new URL(request.url).searchParams.get('mes') ?? '';
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'mes es obligatorio (formato YYYY-MM).' }, { status: 400 });
  }

  return NextResponse.json(await fetchComparacionIngresos(mes));
}
