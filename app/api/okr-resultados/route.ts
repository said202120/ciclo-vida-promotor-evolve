import { NextResponse } from 'next/server';
import { construirRespuestaOkrLectura, esPeriodoValido, fetchResultadoOkrTodasCuentas, periodoActual } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// Lectura para EvolveOS: manda `Authorization: Bearer <OKR_LECTURA_TOKEN>`
// (mismo patrón que Vercel Cron contra CRON_SECRET en
// /api/cron/check-alertas) — nunca en el código, solo en la variable de
// entorno OKR_LECTURA_TOKEN. Sin esa variable configurada, la lectura queda
// cerrada (nadie puede entrar con un token vacío).
function autorizado(request: Request): boolean {
  const secret = process.env.OKR_LECTURA_TOKEN;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// GET /api/okr-resultados?periodo=YYYY-MM — árbol OKR de TODAS las cuentas
// reales (nunca datos de prueba) en el formato de la guía de indicadores de
// Operaciones, para que EvolveOS lo consuma. Reutiliza exactamente
// `fetchResultadoOkrTodasCuentas` + `construirRespuestaOkrLectura` — la misma
// función de cálculo que usa la pantalla, sin una segunda copia. `periodo`
// default al mes actual si no se manda.
export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const periodo = new URL(request.url).searchParams.get('periodo') ?? periodoActual();
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  const cuentas = await fetchResultadoOkrTodasCuentas(periodo);
  return NextResponse.json(construirRespuestaOkrLectura(periodo, cuentas));
}
