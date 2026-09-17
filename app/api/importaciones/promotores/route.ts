import { NextResponse } from 'next/server';
import { requireImportador } from '@/lib/auth';
import { fetchPromotoresParaImportar } from '@/lib/importaciones';

export const dynamic = 'force-dynamic';

// GET /api/importaciones/promotores — vista mínima del padrón (id, nombre,
// rfc, imss) para que el importador cruce por RFC sin exponer el resto del
// tablero a roles que no tienen acceso a él.
export async function GET() {
  const auth = await requireImportador();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchPromotoresParaImportar());
}
