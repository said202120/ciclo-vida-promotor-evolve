import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/users';

export const dynamic = 'force-dynamic';

async function requireGerente() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }) };
  if (session.rol !== 'gerente') {
    return { error: NextResponse.json({ error: 'Solo el gerente puede administrar usuarios.' }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const check = await requireGerente();
  if (check.error) return check.error;
  return NextResponse.json(await listUsers());
}

// Crea un usuario ejecutivo (el gerente ya existe vía script de bootstrap).
export async function POST(request: Request) {
  const check = await requireGerente();
  if (check.error) return check.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!nombre || !email) {
    return NextResponse.json({ error: 'Nombre y email son obligatorios.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  try {
    const user = await createUser({ nombre, email, password, rol: 'ejecutivo' });
    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email.' }, { status: 409 });
    }
    throw err;
  }
}
