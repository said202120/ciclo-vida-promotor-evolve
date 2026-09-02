import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session';

// Nota: usa lib/session.ts (no lib/auth.ts, que depende de next/headers) y lee
// la cookie directo del request — así el middleware no depende de en qué
// runtime corra (nodejs aquí, por un bug de bundling del runtime edge).
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login y el propio endpoint de login/cron quedan fuera del gate de sesión.
  if (pathname === '/login' || pathname.startsWith('/api/auth/') || pathname.startsWith('/api/cron/')) {
    if (pathname === '/login') {
      const secret = process.env.AUTH_SECRET;
      const session = secret ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret) : null;
      if (session) return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const session = secret ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/usuarios') && session.rol !== 'gerente') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)'],
};
