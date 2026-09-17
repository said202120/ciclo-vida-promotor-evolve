'use client';

import type { CapacitacionModulo, CapacitacionResultado, MaterialEstado, Promotor, SupervisorConMarca } from '@/lib/types';
import MaterialesCell from './MaterialesCell';
import EncuestaLinkButton from './EncuestaLinkButton';
import CapacitacionLinkButton from './CapacitacionLinkButton';

type BooleanField = 'carta' | 'usuario' | 'contrato' | 'imss' | 'mod1' | 'mod3' | 'mod6' | 'mod12';

const KIT_ADMIN_COLUMNS: Array<{ field: BooleanField; label: string }> = [
  { field: 'carta', label: 'Carta' },
  { field: 'usuario', label: 'Usuario' },
  { field: 'contrato', label: 'Contrato' },
  { field: 'imss', label: 'IMSS' },
];

const MODULO_COLUMNS: Array<{ field: BooleanField; label: string }> = [
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
  supervisores,
  capacitacionModulos,
  capacitacionResultados,
  onFieldChange,
  onDelete,
  onMaterialToggle,
}: {
  promotores: Promotor[];
  supervisores: SupervisorConMarca[];
  capacitacionModulos: CapacitacionModulo[];
  capacitacionResultados: Array<{ promotorId: string } & CapacitacionResultado>;
  onFieldChange: (
    id: string,
    field: BooleanField | 'nombre' | 'rfc' | 'fechaIngreso' | 'supervisorId',
    value: string | boolean | null
  ) => void;
  onDelete: (id: string) => void;
  onMaterialToggle: (promotorId: string, materialId: string, entregado: boolean) => Promise<MaterialEstado[]>;
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

  const marcaGroups: Array<{ marcaNombre: string; supervisores: SupervisorConMarca[] }> = [];
  for (const s of supervisores) {
    let grupo = marcaGroups.find((g) => g.marcaNombre === s.marcaNombre);
    if (!grupo) {
      grupo = { marcaNombre: s.marcaNombre, supervisores: [] };
      marcaGroups.push(grupo);
    }
    grupo.supervisores.push(s);
  }

  const resultadoPorClave = new Map<string, CapacitacionResultado>();
  for (const r of capacitacionResultados) {
    resultadoPorClave.set(`${r.promotorId}:${r.moduloId}`, r);
  }

  return (
    <div className="roster-table-wrap">
      <table className="roster-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>RFC</th>
            <th>Ingreso</th>
            <th>Antig.</th>
            <th>Supervisor</th>
            {KIT_ADMIN_COLUMNS.map((c) => (
              <th key={c.field}>{c.label}</th>
            ))}
            <th>Materiales</th>
            {MODULO_COLUMNS.map((c) => (
              <th key={c.field}>{c.label}</th>
            ))}
            <th>Encuesta</th>
            {capacitacionModulos.length > 0 && <th>Capacitación</th>}
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
                    type="text"
                    defaultValue={p.rfc ?? ''}
                    placeholder="RFC"
                    onBlur={(e) => {
                      if (e.target.value !== (p.rfc ?? '')) onFieldChange(p.id, 'rfc', e.target.value);
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
                <td>
                  <select
                    value={p.supervisorId ?? ''}
                    onChange={(e) => onFieldChange(p.id, 'supervisorId', e.target.value || null)}
                  >
                    <option value="">Sin asignar</option>
                    {marcaGroups.map((g) => (
                      <optgroup key={g.marcaNombre} label={g.marcaNombre}>
                        {g.supervisores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                {KIT_ADMIN_COLUMNS.map((c) => (
                  <td key={c.field}>
                    <input
                      type="checkbox"
                      checked={p[c.field]}
                      onChange={(e) => onFieldChange(p.id, c.field, e.target.checked)}
                    />
                  </td>
                ))}
                <td className="materiales-td">
                  <MaterialesCell
                    promotorId={p.id}
                    entregados={p.materialesEntregados}
                    total={p.materialesTotal}
                    onToggle={onMaterialToggle}
                  />
                </td>
                {MODULO_COLUMNS.map((c) => (
                  <td key={c.field}>
                    <input
                      type="checkbox"
                      checked={p[c.field]}
                      onChange={(e) => onFieldChange(p.id, c.field, e.target.checked)}
                    />
                  </td>
                ))}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <EncuestaLinkButton promotorId={p.id} tipo="mesa_control" etiqueta="🔗 Mesa de Control" />
                    <EncuestaLinkButton promotorId={p.id} tipo="materiales" etiqueta="📦 Materiales" />
                  </div>
                </td>
                {capacitacionModulos.length > 0 && (
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                      {capacitacionModulos.map((m) => (
                        <CapacitacionLinkButton
                          key={m.id}
                          promotorId={p.id}
                          moduloId={m.id}
                          moduloNombre={m.nombre}
                          resultado={resultadoPorClave.get(`${p.id}:${m.id}`)}
                        />
                      ))}
                    </div>
                  </td>
                )}
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
    </div>
  );
}
