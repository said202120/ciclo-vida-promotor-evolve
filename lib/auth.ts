import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, signSession, verifySession, type SessionPayload } from './session';

export { SESSION_COOKIE, SESSION_TTL_MS };

export class AuthConfigError extends Error {}

/** Lee AUTH_SECRET del entorno. Lanza AuthConfigError si no está configurado. */
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new AuthConfigError('Falta configurar la variable de entorno AUTH_SECRET.');
  return secret;
}

export async function createSessionCookieValue(userId: string, rol: SessionPayload['rol']): Promise<string> {
  return signSession({ userId, rol, exp: Date.now() + SESSION_TTL_MS }, authSecret());
}

/** Sesión del usuario actual, para usar en route handlers y server components. */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return await verifySession(token, authSecret());
  } catch {
    return null;
  }
}

type AuthResult = { session: SessionPayload; error?: undefined } | { session?: undefined; error: NextResponse };

/** Para usar al inicio de cualquier route handler: exige sesión válida (cualquier rol). */
export async function requireSession(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }) };
  }
  return { session };
}

/** Igual que requireSession, pero exige además rol gerente. */
export async function requireGerente(): Promise<AuthResult> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.rol !== 'gerente') {
    return { error: NextResponse.json({ error: 'Solo el gerente puede administrar usuarios.' }, { status: 403 }) };
  }
  return result;
}

/** Tablero de operaciones (padrón, KPI, materiales, módulos, cierres): solo gerente/ejecutivo. */
export async function requireDashboard(): Promise<AuthResult> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.rol !== 'gerente' && result.session.rol !== 'ejecutivo') {
    return { error: NextResponse.json({ error: 'No tienes acceso al tablero.' }, { status: 403 }) };
  }
  return result;
}

/** Importador de Aspel: solo los perfiles de captura, mesa_control y nomina. */
export async function requireImportador(): Promise<AuthResult> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.rol !== 'mesa_control' && result.session.rol !== 'nomina') {
    return { error: NextResponse.json({ error: 'No tienes acceso al importador.' }, { status: 403 }) };
  }
  return result;
}

/** Checklist de carta de ingreso / usuario Emetrix: exclusivo del rol mesa_control. */
export async function requireMesaControl(): Promise<AuthResult> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.rol !== 'mesa_control') {
    return { error: NextResponse.json({ error: 'Solo Mesa de Control tiene acceso a esta pantalla.' }, { status: 403 }) };
  }
  return result;
}
