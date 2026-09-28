import { NextResponse } from 'next/server';
import { requireGerente, requireSession } from '@/lib/auth';
import { esPeriodoValido, fetchKpiManual, periodoActual, updateContratoFirmadoManual, updateImssManual, updateModulosPublicadosManual, validarBaseManual } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

const CAMPOS_MANUAL_KPI: Array<{
  campo: 'contratoFirmado' | 'imss' | 'modulosPublicados';
  update: (marcaId: string, periodo: string, numerador: number | null, denominador: number | null) => Promise<void>;
}> = [
  { campo: 'contratoFirmado', update: updateContratoFirmadoManual },
  { campo: 'imss', update: updateImssManual },
  { campo: 'modulosPublicados', update: updateModulosPublicadosManual },
];

// GET /api/emetrix-ponderacion/kpi-manual?marcaId=...&periodo=YYYY-MM — los
// 3 KPI de captura manual del OKR oficial (Contrato firmado, Alta ante el
// IMSS, Módulos publicados en Emetrix) DE ESE PERIODO — un indicador es de
// una cuenta y un mes, igual que los de sondeo. Cada uno trae
// {numerador, denominador, legacyPorcentaje} (sección 4-bis de la ficha
// técnica). `periodo` default al mes actual si no se manda.
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const marcaId = url.searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }
  const periodo = url.searchParams.get('periodo') ?? periodoActual();
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  return NextResponse.json(await fetchKpiManual(marcaId, periodo));
}

function esNumeroOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}

// PATCH /api/emetrix-ponderacion/kpi-manual — cambia, PARA UN PERIODO, uno o
// más de los 3 KPI de captura manual con base (numerador/denominador): manda
// contratoFirmado/imss/modulosPublicados como {numerador, denominador} —
// solo lo que quieras cambiar. numerador/denominador en null borra esa
// captura (vuelve a "sin-medir" ese mes). El numerador no puede ser mayor al
// denominador (se valida antes de guardar).
export async function PATCH(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  const periodo = typeof body.periodo === 'string' ? body.periodo : periodoActual();
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  const tareas: Promise<void>[] = [];
  for (const { campo, update } of CAMPOS_MANUAL_KPI) {
    if (!(campo in body)) continue;
    const par = body[campo];
    const numerador = par?.numerador ?? null;
    const denominador = par?.denominador ?? null;
    if (!esNumeroOrNull(numerador) || !esNumeroOrNull(denominador)) {
      return NextResponse.json({ error: `${campo} debe traer numerador y denominador, cada uno número o null.` }, { status: 400 });
    }
    if ((numerador !== null && numerador < 0) || (denominador !== null && denominador < 0)) {
      return NextResponse.json({ error: `${campo}: numerador y denominador no pueden ser negativos.` }, { status: 400 });
    }
    const error = validarBaseManual(numerador, denominador);
    if (error) {
      return NextResponse.json({ error: `${campo}: ${error}` }, { status: 400 });
    }
    tareas.push(update(marcaId, periodo, numerador, denominador));
  }

  if (tareas.length === 0) {
    return NextResponse.json(
      { error: 'Nada que actualizar: manda contratoFirmado, imss y/o modulosPublicados como {numerador, denominador}.' },
      { status: 400 }
    );
  }

  await Promise.all(tareas);
  return NextResponse.json({ ok: true });
}
