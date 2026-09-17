import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { fetchRecordatoriosMateriales } from '@/lib/recordatorios';

export const dynamic = 'force-dynamic';

// GET /api/recordatorios-materiales — promotores que cumplen 1 mes de
// ingreso este mes calendario (siempre "ahora", no depende del mes que se
// esté viendo en el tablero).
export async function GET() {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchRecordatoriosMateriales());
}
