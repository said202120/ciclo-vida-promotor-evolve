import type { PipelineStage } from '@/lib/types';

const STAGE_EMOJI: Record<string, string> = {
  Ingreso: '🚪',
  'Kit admin.': '🪪',
  Materiales: '🎒',
  'Módulo 1': '📘',
  'Módulo 2': '📗',
  'Módulo 3': '📙',
  'Módulo 4': '🎓',
};

export default function Pipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="pipeline">
      <p className="section-title" style={{ marginBottom: 18 }}>
        Trayecto del promotor · corte del mes seleccionado
      </p>
      <div className="track">
        {stages.map((s) => (
          <div key={s.label} className={`stage${s.done ? ' done' : ''}`}>
            <div className="line" />
            <div className="dot">{STAGE_EMOJI[s.label] ?? ''}</div>
            <div className="stage-label">{s.label}</div>
            <div className="stage-sub">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
