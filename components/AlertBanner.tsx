import type { AlertaActiva } from '@/lib/types';

const ICONO: Record<AlertaActiva['tipo'], string> = {
  mes1: '🛒',
  mes2: '📦',
};

export default function AlertBanner({ alertas }: { alertas: AlertaActiva[] }) {
  if (alertas.length === 0) return null;

  return (
    <div className="alert-banner">
      <p className="alert-banner-title">
        ⚠️ {alertas.length} {alertas.length === 1 ? 'alerta de materiales' : 'alertas de materiales'}
      </p>
      <div className="alert-banner-list">
        {alertas.map((a) => (
          <div className="alert-item" key={`${a.promotorId}-${a.tipo}`}>
            <span className="alert-item-icon">{ICONO[a.tipo]}</span>
            <span>
              <span className="alert-item-name">{a.nombre}: </span>
              {a.mensaje}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
