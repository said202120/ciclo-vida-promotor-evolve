// Lógica de negocio del OKR "Ciclo de vida del promotor".
// Portado 1:1 desde Artefacto_Ciclo_de_Vida_del_Promotor.html — no cambiar
// fórmulas, pesos ni metas aquí sin validarlo primero contra el prototipo.

import type { Dashboard, KpiId, KpiResult, Modulos, PipelineStage, Promotor } from './types';

export const KPI_META: Record<KpiId, { meta: number; peso: number }> = {
  kr1_carta: { meta: 100, peso: 25 },
  kr1_usuario: { meta: 100, peso: 25 },
  kr1_contrato: { meta: 100, peso: 25 },
  kr1_imss: { meta: 100, peso: 25 },
  kr2_materiales: { meta: 100, peso: 100 },
  kr3_modulos: { meta: 100, peso: 50 },
  kr3_completado: { meta: 90, peso: 50 },
  okr_total: { meta: 100, peso: 100 },
};

export const KR_WEIGHTS = { kr1: 57, kr2: 14, kr3: 29 } as const;

function monthsBetween(fechaIngreso: string | null, refDate: Date): number | null {
  if (!fechaIngreso) return null;
  const ing = new Date(fechaIngreso + 'T00:00:00');
  return (refDate.getFullYear() - ing.getFullYear()) * 12 + (refDate.getMonth() - ing.getMonth());
}

function ymOf(fechaIngreso: string | null): string | null {
  return fechaIngreso ? fechaIngreso.slice(0, 7) : null;
}

function endOfMonth(mesKey: string): Date {
  const [y, m] = mesKey.split('-').map(Number);
  return new Date(y, m - 1, 28);
}

export function pctOf(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.min(100, (num / den) * 100);
}

export function statusFor(pct: number | null, meta: number): KpiResult['status'] {
  if (pct === null) return 'na';
  if (pct >= meta) return 'good';
  if (pct >= meta * 0.85) return 'warn';
  return 'bad';
}

function makeKpi(kpiId: KpiId, num: number, den: number): KpiResult {
  const { meta, peso } = KPI_META[kpiId];
  const pct = pctOf(num, den);
  return { kpiId, num, den, pct, meta, peso, status: statusFor(pct, meta) };
}

export function cohortKR1(roster: Promotor[], mes: string) {
  const inMonth = roster.filter((p) => ymOf(p.fechaIngreso) === mes);
  const den = inMonth.length;
  return {
    carta: makeKpi('kr1_carta', inMonth.filter((p) => p.carta).length, den),
    usuario: makeKpi('kr1_usuario', inMonth.filter((p) => p.usuario).length, den),
    contrato: makeKpi('kr1_contrato', inMonth.filter((p) => p.contrato).length, den),
    imss: makeKpi('kr1_imss', inMonth.filter((p) => p.imss).length, den),
  };
}

export function cohortKR2(roster: Promotor[], mes: string): KpiResult {
  const ref = endOfMonth(mes);
  const due = roster.filter((p) => monthsBetween(p.fechaIngreso, ref) === 2);
  return makeKpi('kr2_materiales', due.filter((p) => p.materiales).length, due.length);
}

export function cohortKPI32(roster: Promotor[], mes: string): KpiResult {
  const ref = endOfMonth(mes);
  const milestones: Array<{ m: number; f: 'mod1' | 'mod3' | 'mod6' | 'mod12' }> = [
    { m: 1, f: 'mod1' },
    { m: 3, f: 'mod3' },
    { m: 6, f: 'mod6' },
    { m: 12, f: 'mod12' },
  ];
  let num = 0;
  let den = 0;
  for (const ms of milestones) {
    const elig = roster.filter((p) => monthsBetween(p.fechaIngreso, ref) === ms.m);
    den += elig.length;
    num += elig.filter((p) => p[ms.f]).length;
  }
  return makeKpi('kr3_completado', num, den);
}

function laneScore(kpis: KpiResult[]): number | null {
  const pcts = kpis.map((k) => k.pct).filter((x): x is number => x !== null);
  return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
}

function buildPipeline(
  kr1: { carta: KpiResult; usuario: KpiResult; contrato: KpiResult; imss: KpiResult },
  kr2: KpiResult,
  publicadosCount: number
): PipelineStage[] {
  const kr1Kpis = [kr1.carta, kr1.usuario, kr1.contrato, kr1.imss];
  return [
    { label: 'Ingreso', sub: 'Día 0', done: true },
    {
      label: 'Kit admin.',
      sub: 'Día 1',
      done: (kr1.carta.den ?? 0) > 0 && kr1Kpis.every((k) => (k.num ?? 0) >= (k.den ?? 0)),
    },
    { label: 'Materiales', sub: 'Mes 2', done: (kr2.den ?? 0) > 0 && (kr2.num ?? 0) >= (kr2.den ?? 0) },
    { label: 'Módulo 1', sub: 'Mes 1', done: publicadosCount >= 1 },
    { label: 'Módulo 2', sub: 'Mes 3', done: publicadosCount >= 2 },
    { label: 'Módulo 3', sub: 'Mes 6', done: publicadosCount >= 3 },
    { label: 'Módulo 4', sub: 'Mes 12', done: publicadosCount >= 4 },
  ];
}

/** Cálculo en vivo, a partir del padrón actual — usado para el mes no cerrado. */
export function computeDashboard(roster: Promotor[], modulos: Modulos, mes: string): Dashboard {
  const kr1 = cohortKR1(roster, mes);
  const kr2materiales = cohortKR2(roster, mes);
  const publicadosCount = (['mod1', 'mod3', 'mod6', 'mod12'] as const).filter((k) => modulos[k]).length;
  const kr3modulos = makeKpi('kr3_modulos', publicadosCount, modulos.comprometidos);
  const kr3completado = cohortKPI32(roster, mes);

  const kr1Score = laneScore([kr1.carta, kr1.usuario, kr1.contrato, kr1.imss]);
  const kr2Score = laneScore([kr2materiales]);
  const kr3Score = laneScore([kr3modulos, kr3completado]);

  let weighted = 0;
  let wt = 0;
  (['kr1', 'kr2', 'kr3'] as const).forEach((id) => {
    const score = id === 'kr1' ? kr1Score : id === 'kr2' ? kr2Score : kr3Score;
    if (score !== null) {
      weighted += score * KR_WEIGHTS[id];
      wt += KR_WEIGHTS[id];
    }
  });
  const okrScore = wt > 0 ? weighted / wt : null;

  return {
    mes,
    closed: false,
    kr1: { ...kr1, score: kr1Score },
    kr2: { materiales: kr2materiales, score: kr2Score },
    kr3: { modulos: kr3modulos, completado: kr3completado, score: kr3Score },
    okrTotal: { score: okrScore },
    pipeline: buildPipeline(kr1, kr2materiales, publicadosCount),
  };
}

/** Fila lista para insertar/actualizar en cierres_mensuales. */
export type CierreRow = {
  kpiId: KpiId;
  numerador: number | null;
  denominador: number | null;
  porcentaje: number | null;
};

export function dashboardToCierreRows(d: Dashboard): CierreRow[] {
  return [
    { kpiId: 'kr1_carta', numerador: d.kr1.carta.num, denominador: d.kr1.carta.den, porcentaje: d.kr1.carta.pct },
    { kpiId: 'kr1_usuario', numerador: d.kr1.usuario.num, denominador: d.kr1.usuario.den, porcentaje: d.kr1.usuario.pct },
    { kpiId: 'kr1_contrato', numerador: d.kr1.contrato.num, denominador: d.kr1.contrato.den, porcentaje: d.kr1.contrato.pct },
    { kpiId: 'kr1_imss', numerador: d.kr1.imss.num, denominador: d.kr1.imss.den, porcentaje: d.kr1.imss.pct },
    { kpiId: 'kr2_materiales', numerador: d.kr2.materiales.num, denominador: d.kr2.materiales.den, porcentaje: d.kr2.materiales.pct },
    { kpiId: 'kr3_modulos', numerador: d.kr3.modulos.num, denominador: d.kr3.modulos.den, porcentaje: d.kr3.modulos.pct },
    { kpiId: 'kr3_completado', numerador: d.kr3.completado.num, denominador: d.kr3.completado.den, porcentaje: d.kr3.completado.pct },
    { kpiId: 'okr_total', numerador: null, denominador: null, porcentaje: d.okrTotal.score },
  ];
}

type CierreDbRow = {
  kpi_id: string;
  numerador: number | string | null;
  denominador: number | string | null;
  porcentaje: number | string | null;
};

/** Reconstruye el Dashboard a partir de filas ya cerradas (fijas) en cierres_mensuales. */
export function dashboardFromCierreRows(mes: string, rows: CierreDbRow[]): Dashboard {
  const byId = new Map(rows.map((r) => [r.kpi_id, r]));
  const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

  const toKpi = (kpiId: KpiId): KpiResult => {
    const row = byId.get(kpiId);
    const { meta, peso } = KPI_META[kpiId];
    const pct = num(row?.porcentaje);
    return { kpiId, num: num(row?.numerador), den: num(row?.denominador), pct, meta, peso, status: statusFor(pct, meta) };
  };

  const kr1 = {
    carta: toKpi('kr1_carta'),
    usuario: toKpi('kr1_usuario'),
    contrato: toKpi('kr1_contrato'),
    imss: toKpi('kr1_imss'),
  };
  const kr2materiales = toKpi('kr2_materiales');
  const kr3modulos = toKpi('kr3_modulos');
  const kr3completado = toKpi('kr3_completado');
  const okrPct = num(byId.get('okr_total')?.porcentaje);

  const kr1Score = laneScore([kr1.carta, kr1.usuario, kr1.contrato, kr1.imss]);
  const kr2Score = laneScore([kr2materiales]);
  const kr3Score = laneScore([kr3modulos, kr3completado]);
  const publicadosCount = kr3modulos.num ?? 0;

  return {
    mes,
    closed: true,
    kr1: { ...kr1, score: kr1Score },
    kr2: { materiales: kr2materiales, score: kr2Score },
    kr3: { modulos: kr3modulos, completado: kr3completado, score: kr3Score },
    okrTotal: { score: okrPct },
    pipeline: buildPipeline(kr1, kr2materiales, publicadosCount),
  };
}
