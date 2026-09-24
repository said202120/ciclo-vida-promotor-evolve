import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchResultadoTodasCuentas } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/resultado-todas — resumen de todas las
// cuentas que ya tienen al menos una carga, para comparar de un vistazo.
export async function GET() {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchResultadoTodasCuentas());
}
