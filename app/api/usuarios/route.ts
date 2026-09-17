import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/users';
import type { Rol } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ROLES_VALIDOS: Rol[] = ['gerente', 'ejecutivo', 'mesa_control', 'nomina'];

export async function GET() {
  const check = await requireGerente();
  if (check.error) return check.error;
  return NextResponse.json(await listUsers());
}

// Crea un usuario de cualquier rol (el gerente ya existe vía script de bootstrap).
// Sin autoregistro: solo un gerente puede crear cuentas, desde /usuarios.
export async function POST(request: Request) {
  const check = await requireGerente();
  if (check.error) return check.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const rol = typeof body.rol === 'string' ? (body.rol as Rol) : null;

  if (!nombre || !email) {
    return NextResponse.json({ error: 'Nombre y email son obligatorios.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }
  if (!rol || !ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: `El rol debe ser uno de: ${ROLES_VALIDOS.join(', ')}.` }, { status: 400 });
  }

  try {
    const user = await createUser({ nombre, email, password, rol });
    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email.' }, { status: 409 });
    }
    throw err;
  }
}
