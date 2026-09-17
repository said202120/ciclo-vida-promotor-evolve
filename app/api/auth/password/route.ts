import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUserByIdConHash, setPassword, verifyPassword } from '@/lib/users';

export const dynamic = 'force-dynamic';

// PATCH /api/auth/password { passwordActual, passwordNueva } — cualquier rol
// puede cambiar su propia contraseña, siempre que confirme la actual.
export async function PATCH(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const passwordActual = typeof body.passwordActual === 'string' ? body.passwordActual : '';
  const passwordNueva = typeof body.passwordNueva === 'string' ? body.passwordNueva : '';

  if (passwordNueva.length < 8) {
    return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  const user = await findUserByIdConHash(auth.session.userId);
  if (!user || !(await verifyPassword(passwordActual, user.password_hash))) {
    return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 401 });
  }

  await setPassword(user.id, passwordNueva);
  return NextResponse.json({ ok: true });
}
