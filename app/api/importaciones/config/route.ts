import { NextResponse } from 'next/server';
import { requireImportador } from '@/lib/auth';
import { fetchImportConfig, saveImportConfig } from '@/lib/importaciones';
import { CAMPOS_PERMITIDOS, esRolImportador } from '@/lib/import-permisos';
import type { ImportCampo } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/importaciones/config — mapeo guardado para el rol de quien pregunta (para proponerlo por defecto).
export async function GET() {
  const auth = await requireImportador();
  if (auth.error) return auth.error;
  const rol = auth.session.rol;
  if (!esRolImportador(rol)) {
    return NextResponse.json({ error: 'No tienes acceso al importador.' }, { status: 403 });
  } // nunca debería pasar, requireImportador ya lo exige
  return NextResponse.json(await fetchImportConfig(rol));
}

// PATCH /api/importaciones/config — confirma/ajusta el mapeo del rol y lo sobreescribe.
// Solo acepta campos que ese rol tiene permitido mapear (nunca confía en el cliente).
export async function PATCH(request: Request) {
  const auth = await requireImportador();
  if (auth.error) return auth.error;
  const rol = auth.session.rol;
  if (!esRolImportador(rol)) {
    return NextResponse.json({ error: 'No tienes acceso al importador.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const mapeo = body.mapeo;
  if (!mapeo || typeof mapeo !== 'object' || Array.isArray(mapeo)) {
    return NextResponse.json({ error: 'mapeo inválido.' }, { status: 400 });
  }

  const camposValidos: ImportCampo[] = ['ignorar', ...CAMPOS_PERMITIDOS[rol]];
  const camposUnicos = CAMPOS_PERMITIDOS[rol].filter((c) => c !== 'rfc');

  const clean: Record<string, ImportCampo> = {};
  for (const [header, campo] of Object.entries(mapeo as Record<string, unknown>)) {
    if (typeof header !== 'string' || !header.trim()) continue;
    if (!camposValidos.includes(campo as ImportCampo)) {
      return NextResponse.json(
        { error: `Tu rol no puede asignar la columna "${header}" a ese campo.` },
        { status: 400 }
      );
    }
    clean[header] = campo as ImportCampo;
  }

  if (Object.values(clean).filter((c) => c === 'rfc').length !== 1) {
    return NextResponse.json({ error: 'Debes asignar exactamente una columna a RFC.' }, { status: 400 });
  }
  for (const campo of camposUnicos) {
    const asignadas = Object.values(clean).filter((c) => c === campo).length;
    if (asignadas > 1) {
      return NextResponse.json({ error: `Solo puede haber una columna asignada a "${campo}".` }, { status: 400 });
    }
  }
  if (camposUnicos.length > 0 && !camposUnicos.some((campo) => Object.values(clean).includes(campo))) {
    return NextResponse.json(
      { error: `Asigna al menos una columna a ${camposUnicos.join(' o ')}.` },
      { status: 400 }
    );
  }

  await saveImportConfig(rol, clean);
  return NextResponse.json(clean);
}
