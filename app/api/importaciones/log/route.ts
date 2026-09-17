import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { fetchImportLog } from '@/lib/importaciones';

export const dynamic = 'force-dynamic';

// GET /api/importaciones/log — historial de corridas del importador, para ver cuándo fue la última sincronización.
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchImportLog());
}
