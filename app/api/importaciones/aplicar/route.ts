import { NextResponse } from 'next/server';
import { requireImportador } from '@/lib/auth';
import { aplicarImportacion } from '@/lib/importaciones';
import { esRolImportador } from '@/lib/import-permisos';
import type { RegistroExtraido } from '@/lib/import-shared';

export const dynamic = 'force-dynamic';

function esFechaOpcional(v: unknown): v is string | null {
  return v === null || v === undefined || typeof v === 'string';
}

function isRegistro(value: unknown): value is RegistroExtraido {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.rfc === 'string' &&
    esFechaOpcional(r.contratoFecha) &&
    esFechaOpcional(r.imssFecha) &&
    esFechaOpcional(r.idEmetrix) &&
    esFechaOpcional(r.idNomina)
  );
}

// POST /api/importaciones/aplicar { registros } — cruza por RFC contra el
// padrón actual (el servidor vuelve a hacer el match, nunca confía en el del
// cliente) y marca el campo correspondiente en true con su fecha cuando aplica.
export async function POST(request: Request) {
  const auth = await requireImportador();
  if (auth.error) return auth.error;
  const rol = auth.session.rol;
  if (!esRolImportador(rol)) {
    return NextResponse.json({ error: 'No tienes acceso al importador.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const registros = Array.isArray(body.registros) ? body.registros : null;
  if (!registros || !registros.every(isRegistro)) {
    return NextResponse.json({ error: 'registros inválido.' }, { status: 400 });
  }

  const resultado = await aplicarImportacion(registros, auth.session.userId, rol);
  return NextResponse.json(resultado);
}
