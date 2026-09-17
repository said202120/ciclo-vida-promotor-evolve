import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { fetchMaterialesResumen } from '@/lib/materiales';

export const dynamic = 'force-dynamic';

// GET /api/materiales/resumen — conteo por artículo contra todo el padrón
// (no la cohorte del mes seleccionado). Alimenta el desglose de solo lectura
// del carril de Operaciones.
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchMaterialesResumen());
}
