import type { Modulos } from '@/lib/types';

const ITEMS: Array<{ key: keyof Omit<Modulos, 'comprometidos'>; label: string }> = [
  { key: 'mod1', label: 'Módulo 1 (mes 1)' },
  { key: 'mod3', label: 'Módulo 2 (mes 3)' },
  { key: 'mod6', label: 'Módulo 3 (mes 6)' },
  { key: 'mod12', label: 'Módulo 4 (mes 12)' },
];

export default function ModuleToggles({
  modulos,
  onToggle,
  onComprometidosChange,
}: {
  modulos: Modulos;
  onToggle: (key: keyof Omit<Modulos, 'comprometidos'>, value: boolean) => void;
  onComprometidosChange: (value: number) => void;
}) {
  return (
    <div className="module-toggles">
      {ITEMS.map(({ key, label }) => (
        <label className="mod-toggle" key={key}>
          <input
            type="checkbox"
            checked={modulos[key]}
            onChange={(e) => onToggle(key, e.target.checked)}
          />
          {label} publicado
        </label>
      ))}
      <div className="field-inline">
        <label>Comprometidos a la fecha</label>
        <input
          type="number"
          min={0}
          max={4}
          value={modulos.comprometidos}
          onChange={(e) => onComprometidosChange(Math.max(0, Math.min(4, parseInt(e.target.value, 10) || 0)))}
        />
      </div>
    </div>
  );
}
