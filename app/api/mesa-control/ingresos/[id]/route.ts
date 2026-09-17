import { NextResponse } from 'next/server';
import { requireMesaControl } from '@/lib/auth';
import { setIngresoCampo } from '@/lib/mesa-control';

export const dynamic = 'force-dynamic';

const CAMPOS_VALIDOS = ['carta', 'usuario'] as const;

// PATCH /api/mesa-control/ingresos/[id] { campo, valor } — marca/desmarca
// carta de ingreso o usuario Emetrix. Único endpoint de escritura de este
// checklist: acotado a estos dos campos, sin importar qué más mande el body.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMesaControl();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const campo = typeof body.campo === 'string' ? body.campo : '';
  const valor = typeof body.valor === 'boolean' ? body.valor : null;

  if (!CAMPOS_VALIDOS.includes(campo as 'carta' | 'usuario') || valor === null) {
    return NextResponse.json({ error: 'campo debe ser "carta" o "usuario", y valor un booleano.' }, { status: 400 });
  }

  await setIngresoCampo(id, campo as 'carta' | 'usuario', valor);
  return NextResponse.json({ ok: true });
}
