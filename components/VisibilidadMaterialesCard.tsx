import type { KpiResult } from '@/lib/types';

const STATUS_LABEL: Record<KpiResult['status'], string> = {
  good: 'en meta',
  warn: 'en riesgo',
  bad: 'fuera de meta',
  na: 'sin datos',
};

export default function VisibilidadMaterialesCard({ kpi }: { kpi: KpiResult }) {
  return (
    <div className="lane" style={{ marginBottom: 24 }}>
      <div className="kpi-row" style={{ borderBottom: 'none' }}>
        <div className="kpi-name-block">
          <span className="kpi-emoji">👀</span>
          <div>
            <div className="kpi-name">% de promotores con visibilidad de fecha de entrega de materiales</div>
            <div className="kpi-formula">
              Indicador temprano, no pondera el OKR · universo = nuevos ingresos dentro de sus primeros 3 días
              hábiles · quien no ha contestado la encuesta de Materiales queda pendiente, no cuenta como incumplido
            </div>
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
          <div className="weight">meta {kpi.meta}%</div>
          <div className={`pill ${kpi.status}`}>{STATUS_LABEL[kpi.status]}</div>
        </div>
      </div>
    </div>
  );
}
