import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { esPeriodoValido, fetchKpiManual, periodoActual, updateContratoFirmadoManual, updateImssManual, updateModulosPublicadosManual } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

const CAMPOS_MANUAL_KPI: Array<{
  campo: 'contratoFirmadoManual' | 'imssManual' | 'modulosPublicadosManual';
  update: (marcaId: string, periodo: string, valor: number | null) => Promise<void>;
}> = [
  { campo: 'contratoFirmadoManual', update: updateContratoFirmadoManual },
  { campo: 'imssManual', update: updateImssManual },
  { campo: 'modulosPublicadosManual', update: updateModulosPublicadosManual },
];

// GET /api/emetrix-ponderacion/kpi-manual?marcaId=...&periodo=YYYY-MM — los
// 3 KPI de captura manual del OKR oficial (Contrato firmado, Alta ante el
// IMSS, Módulos publicados en Emetrix) DE ESE PERIODO — un indicador es de
// una cuenta y un mes, igual que los de sondeo. `periodo` default al mes
// actual si no se manda.
export async function GET(request: Request) {
  const auth = await requireGerente();
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

// PATCH /api/emetrix-ponderacion/kpi-manual — cambia, PARA UN PERIODO, uno o
// más de los 3 KPI de captura manual (contratoFirmadoManual, imssManual,
// modulosPublicadosManual) — manda solo lo que quieras cambiar. null borra
// el valor capturado (vuelve a "sin-medir" ese mes).
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
    const valor = body[campo];
    if (valor !== null && (typeof valor !== 'number' || valor < 0 || valor > 100)) {
      return NextResponse.json({ error: `${campo} debe ser un número entre 0 y 100, o null para borrarlo.` }, { status: 400 });
    }
    tareas.push(update(marcaId, periodo, valor));
  }

  if (tareas.length === 0) {
    return NextResponse.json(
      { error: 'Nada que actualizar: manda contratoFirmadoManual, imssManual y/o modulosPublicadosManual.' },
      { status: 400 }
    );
  }

  await Promise.all(tareas);
  return NextResponse.json({ ok: true });
}
