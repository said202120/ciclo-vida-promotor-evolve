import { NextResponse } from 'next/server';
import { AuthConfigError, createSessionCookieValue, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth';
import { findUserByEmail, verifyPassword } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son obligatorios.' }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'Email o contraseña incorrectos.' }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionCookieValue(user.id, user.rol);
  } catch (err) {
    if (err instanceof AuthConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  const res = NextResponse.json({ id: user.id, nombre: user.nombre, email: user.email, rol: user.rol });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
