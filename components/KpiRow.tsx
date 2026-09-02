import type { KpiResult } from '@/lib/types';

const STATUS_LABEL: Record<KpiResult['status'], string> = {
  good: 'en meta',
  warn: 'en riesgo',
  bad: 'fuera de meta',
  na: 'sin datos',
};

export default function KpiRow({
  name,
  emoji,
  formula,
  kpi,
}: {
  name: string;
  emoji: string;
  formula: string;
  kpi: KpiResult;
}) {
  return (
    <div className="kpi-row">
      <div className="kpi-name-block">
        <span className="kpi-emoji">{emoji}</span>
        <div>
          <div className="kpi-name">{name}</div>
          <div className="kpi-formula">{formula}</div>
        </div>
      </div>
      <div className="kpi-count">
        {kpi.num ?? 0}
        <span className="lbl">cumplen</span>
      </div>
      <div className="kpi-count">
        {kpi.den ?? 0}
        <span className="lbl">universo</span>
      </div>
      <div className="result">
        <div className="pct">{kpi.pct === null ? '—' : `${kpi.pct.toFixed(0)}%`}</div>
        <div className="weight">
          meta {kpi.meta}% · peso {kpi.peso}%
        </div>
        <div className={`pill ${kpi.status}`}>{STATUS_LABEL[kpi.status]}</div>
      </div>
    </div>
  );
}
