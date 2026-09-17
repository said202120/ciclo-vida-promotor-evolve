import { NextResponse } from 'next/server';
import { requireMesaControl } from '@/lib/auth';
import { fetchIngresosDelMes } from '@/lib/mesa-control';

export const dynamic = 'force-dynamic';

// GET /api/mesa-control/ingresos?mes=YYYY-MM — nuevos ingresos de ese mes, con su estado de carta/usuario Emetrix.
export async function GET(request: Request) {
  const auth = await requireMesaControl();
  if (auth.error) return auth.error;

  const mes = new URL(request.url).searchParams.get('mes') ?? '';
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'mes es obligatorio (formato YYYY-MM).' }, { status: 400 });
  }

  return NextResponse.json(await fetchIngresosDelMes(mes));
}
