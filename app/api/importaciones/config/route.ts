import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { fetchImportConfig, saveImportConfig } from '@/lib/importaciones';
import type { ImportCampo } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CAMPOS_VALIDOS: ImportCampo[] = ['rfc', 'contratoFecha', 'imssFecha', 'ignorar'];
const CAMPOS_UNICOS: ImportCampo[] = ['rfc', 'contratoFecha', 'imssFecha'];

// GET /api/importaciones/config — mapeo guardado (para proponerlo por defecto).
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  return NextResponse.json(await fetchImportConfig());
}

// PATCH /api/importaciones/config — confirma/ajusta el mapeo y lo sobreescribe.
export async function PATCH(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const mapeo = body.mapeo;
  if (!mapeo || typeof mapeo !== 'object' || Array.isArray(mapeo)) {
    return NextResponse.json({ error: 'mapeo inválido.' }, { status: 400 });
  }

  const clean: Record<string, ImportCampo> = {};
  for (const [header, campo] of Object.entries(mapeo as Record<string, unknown>)) {
    if (typeof header !== 'string' || !header.trim()) continue;
    if (!CAMPOS_VALIDOS.includes(campo as ImportCampo)) {
      return NextResponse.json({ error: `Valor de mapeo inválido para la columna "${header}".` }, { status: 400 });
    }
    clean[header] = campo as ImportCampo;
  }

  if (Object.values(clean).filter((c) => c === 'rfc').length !== 1) {
    return NextResponse.json({ error: 'Debes asignar exactamente una columna a RFC.' }, { status: 400 });
  }
  for (const campo of CAMPOS_UNICOS) {
    const asignadas = Object.values(clean).filter((c) => c === campo).length;
    if (asignadas > 1) {
      return NextResponse.json({ error: `Solo puede haber una columna asignada a "${campo}".` }, { status: 400 });
    }
  }
  const hayFecha = Object.values(clean).some((c) => c === 'contratoFecha' || c === 'imssFecha');
  if (!hayFecha) {
    return NextResponse.json(
      { error: 'Asigna al menos una columna a fecha de contrato o fecha de alta IMSS.' },
      { status: 400 }
    );
  }

  await saveImportConfig(clean);
  return NextResponse.json(clean);
}
