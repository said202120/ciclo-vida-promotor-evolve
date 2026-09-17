import { NextResponse } from 'next/server';
import { requireDashboard } from '@/lib/auth';
import { fetchCapacitacionModulosBasico } from '@/lib/capacitaciones';

export const dynamic = 'force-dynamic';

// GET /api/capacitacion-modulos/basico — solo id/orden/nombre/umbral, sin
// preguntas. Para el padrón: cualquiera con acceso al tablero puede leerlo
// (generar el link y ver el estatus), solo gerente administra el contenido.
export async function GET() {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchCapacitacionModulosBasico());
}
