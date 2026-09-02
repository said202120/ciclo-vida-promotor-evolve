import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const user = await findUserById(session.userId);
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 401 });

  return NextResponse.json(user);
}
