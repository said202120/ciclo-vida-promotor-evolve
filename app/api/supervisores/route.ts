import { NextResponse } from 'next/server';
import { requireDashboard, requireGerente } from '@/lib/auth';
import { createSupervisor, fetchSupervisoresConMarca } from '@/lib/marcas';

export const dynamic = 'force-dynamic';

// GET /api/supervisores — lista plana (con marca) para el selector de
// "supervisor asignado" del padrón. Cualquiera con acceso al tablero puede
// leerla; solo gerente puede administrar el maestro (POST/PATCH/DELETE).
export async function GET() {
  const auth = await requireDashboard();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchSupervisoresConMarca());
}

export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  if (!nombre || !marcaId) {
    return NextResponse.json({ error: 'Nombre y marca son obligatorios.' }, { status: 400 });
  }

  try {
    const supervisor = await createSupervisor(nombre, marcaId);
    return NextResponse.json(supervisor, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Ese supervisor ya existe en esa marca.' }, { status: 409 });
    }
    throw err;
  }
}
