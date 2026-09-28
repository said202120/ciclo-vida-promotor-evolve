const ETAPAS = [
  { emoji: '🚪', label: 'Ingreso' },
  { emoji: '🪪', label: 'Kit admin.' },
  { emoji: '🎒', label: 'Materiales' },
  { emoji: '📚', label: 'Módulos' },
];

/**
 * Banda decorativa bajo el título de "/": el trayecto del promotor
 * (Ingreso → Kit admin. → Materiales → Módulos), el mismo recorrido que mide
 * el OKR oficial (KR1/KR2/KR3). Puramente visual — sin datos, sin "done" por
 * cuenta — para no duplicar ningún cálculo del árbol OKR de abajo.
 */
export default function TrayectoBanda() {
  return (
    <div className="emetrix-trayecto">
      {ETAPAS.map((etapa, i) => (
        <div className="emetrix-trayecto-etapa" key={etapa.label}>
          {i > 0 && <div className="emetrix-trayecto-linea" />}
          <div className="emetrix-trayecto-dot">{etapa.emoji}</div>
          <div className="emetrix-trayecto-label">{etapa.label}</div>
        </div>
      ))}
    </div>
  );
}
