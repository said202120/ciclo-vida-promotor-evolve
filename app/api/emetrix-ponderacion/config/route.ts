import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchConfig, updateHeadcountManual, updateUmbralRespuesta } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/config?marcaId=... — si la cuenta ya tiene
// guardado si incluye celular (Materiales), su umbral de % de respuesta
// (80% si nunca se ha tocado) y su headcount (uno solo, aplica a los 3 KR).
// Nada de esto es por periodo — para los 3 KPI de captura manual (que SÍ son
// por periodo), ver GET /api/emetrix-ponderacion/kpi-manual.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  return NextResponse.json(await fetchConfig(marcaId));
}

// PATCH /api/emetrix-ponderacion/config — cambia el umbral mínimo de % de
// respuesta y/o el headcount de la cuenta (manda solo lo que quieras
// cambiar). null borra el valor capturado (vuelve a "sin capturar").
export async function PATCH(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  const tareas: Promise<void>[] = [];

  if ('umbralRespuesta' in body) {
    const umbralRespuesta = typeof body.umbralRespuesta === 'number' ? body.umbralRespuesta : null;
    if (umbralRespuesta === null || umbralRespuesta < 0 || umbralRespuesta > 100) {
      return NextResponse.json({ error: 'umbralRespuesta debe ser un número entre 0 y 100.' }, { status: 400 });
    }
    tareas.push(updateUmbralRespuesta(marcaId, umbralRespuesta));
  }

  if ('headcountManual' in body) {
    const headcountManual = body.headcountManual;
    if (headcountManual !== null && (typeof headcountManual !== 'number' || headcountManual <= 0)) {
      return NextResponse.json({ error: 'headcountManual debe ser un número mayor a cero, o null para borrarlo.' }, { status: 400 });
    }
    tareas.push(updateHeadcountManual(marcaId, headcountManual));
  }

  if (tareas.length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar: manda umbralRespuesta y/o headcountManual.' }, { status: 400 });
  }

  await Promise.all(tareas);
  return NextResponse.json({ ok: true });
}
