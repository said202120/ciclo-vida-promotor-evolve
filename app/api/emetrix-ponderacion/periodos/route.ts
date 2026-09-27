import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchPeriodosEmetrixPonderacion } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/periodos — periodos ("YYYY-MM") con al menos
// una carga guardada (de cualquier cuenta), más recientes primero, más el
// mes actual (aunque no tenga cargas todavía) — para poblar el selector de
// periodo de la pantalla.
export async function GET() {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchPeriodosEmetrixPonderacion());
}
