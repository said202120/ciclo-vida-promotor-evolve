'use client';

import type { Promotor } from '@/lib/types';

type BooleanField = 'carta' | 'usuario' | 'contrato' | 'imss' | 'materiales' | 'mod1' | 'mod3' | 'mod6' | 'mod12';

const BOOLEAN_COLUMNS: Array<{ field: BooleanField; label: string }> = [
  { field: 'carta', label: 'Carta' },
  { field: 'usuario', label: 'Usuario' },
  { field: 'contrato', label: 'Contrato' },
  { field: 'imss', label: 'IMSS' },
  { field: 'materiales', label: 'Materiales' },
  { field: 'mod1', label: 'Mód.1' },
  { field: 'mod3', label: 'Mód.3' },
  { field: 'mod6', label: 'Mód.6' },
  { field: 'mod12', label: 'Mód.12' },
];

function monthsSince(fechaIngreso: string | null): number | null {
  if (!fechaIngreso) return null;
  const ing = new Date(fechaIngreso + 'T00:00:00');
  const now = new Date();
  return (now.getFullYear() - ing.getFullYear()) * 12 + (now.getMonth() - ing.getMonth());
}

export default function RosterTable({
  promotores,
  onFieldChange,
  onDelete,
}: {
  promotores: Promotor[];
  onFieldChange: (id: string, field: BooleanField | 'nombre' | 'fechaIngreso', value: string | boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (promotores.length === 0) {
    return (
      <div className="empty-roster">
        <div className="empty-icon">🧭</div>
        Sin promotores capturados todavía. Agrega el primero con el botón de arriba.
      </div>
    );
  }

  const rows = [...promotores].sort((a, b) => (a.fechaIngreso || '').localeCompare(b.fechaIngreso || ''));

  return (
    <table className="roster-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Ingreso</th>
          <th>Antig.</th>
          {BOOLEAN_COLUMNS.map((c) => (
            <th key={c.field}>{c.label}</th>
          ))}
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const antig = monthsSince(p.fechaIngreso);
          return (
            <tr key={p.id}>
              <td>
                <input
                  type="text"
                  defaultValue={p.nombre}
                  placeholder="Nombre"
                  onBlur={(e) => {
                    if (e.target.value !== p.nombre) onFieldChange(p.id, 'nombre', e.target.value);
                  }}
                />
              </td>
              <td>
                <input
                  type="date"
                  defaultValue={p.fechaIngreso ?? ''}
                  onChange={(e) => {
                    if (e.target.value) onFieldChange(p.id, 'fechaIngreso', e.target.value);
                  }}
                />
              </td>
              <td className="antig">{antig === null ? '—' : `${antig}m`}</td>
              {BOOLEAN_COLUMNS.map((c) => (
                <td key={c.field}>
                  <input
                    type="checkbox"
                    checked={p[c.field]}
                    onChange={(e) => onFieldChange(p.id, c.field, e.target.checked)}
                  />
                </td>
              ))}
              <td>
                <button className="del-btn" title="Eliminar" onClick={() => onDelete(p.id)}>
                  ✕
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
