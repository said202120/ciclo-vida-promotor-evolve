import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { aplicarImportacion } from '@/lib/importaciones';
import type { RegistroExtraido } from '@/lib/import-shared';

export const dynamic = 'force-dynamic';

function isRegistro(value: unknown): value is RegistroExtraido {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.rfc === 'string' &&
    (r.contratoFecha === null || typeof r.contratoFecha === 'string') &&
    (r.imssFecha === null || typeof r.imssFecha === 'string')
  );
}

// POST /api/importaciones/aplicar { registros } — cruza por RFC contra el
// padrón actual (el servidor vuelve a hacer el match, nunca confía en el del
// cliente) y marca contrato=true / imss=true con su fecha cuando aplica.
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const registros = Array.isArray(body.registros) ? body.registros : null;
  if (!registros || !registros.every(isRegistro)) {
    return NextResponse.json({ error: 'registros inválido.' }, { status: 400 });
  }

  const resultado = await aplicarImportacion(registros, auth.session.userId);
  return NextResponse.json(resultado);
}
