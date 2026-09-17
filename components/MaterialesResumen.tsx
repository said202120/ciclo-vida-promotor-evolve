'use client';

import { useEffect, useState } from 'react';
import type { MaterialCategoria, MaterialResumenItem } from '@/lib/types';
import { fetchMaterialesResumen } from '@/lib/api-client';

const CATEGORIA_LABEL: Record<MaterialCategoria, string> = {
  tecnologia: 'Tecnología y sistema',
  trabajo: 'Materiales de trabajo',
};

const CATEGORIA_ICONO: Record<MaterialCategoria, string> = {
  tecnologia: '📱',
  trabajo: '🎒',
};

const ITEM_ICONO: Record<string, string> = {
  'Equipo celular': '📱',
  'Línea corporativa': '📶',
  'Franela Metro': '🧽',
  Cortadores: '✂️',
  Navajas: '🪒',
  'Botas Van Vien': '👢',
  Cintas: '🧻',
  Guantes: '🧤',
  Faja: '🩹',
  'Marcador Delgado': '🖍️',
  'Quita Goma': '🧴',
  'Plumero Avestruz': '🪶',
  'Mochila Royal Swiss': '🎒',
};

const CATEGORIAS: MaterialCategoria[] = ['tecnologia', 'trabajo'];

export default function MaterialesResumen() {
  const [items, setItems] = useState<MaterialResumenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<MaterialCategoria, boolean>>({ tecnologia: false, trabajo: false });

  useEffect(() => {
    fetchMaterialesResumen()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el desglose.'));
  }, []);

  function toggle(cat: MaterialCategoria) {
    setOpen((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  return (
    <div className="resumen">
      <p className="resumen-title">Desglose por artículo · todo el padrón</p>
      {error && <p className="resumen-status resumen-error">{error}</p>}
      {CATEGORIAS.map((cat) => {
        const catItems = (items ?? []).filter((m) => m.categoria === cat);
        const expanded = open[cat];
        return (
          <div className="resumen-section" key={cat}>
            <button type="button" className="resumen-section-head" onClick={() => toggle(cat)}>
              <span className={`resumen-arrow${expanded ? ' expanded' : ''}`}>▸</span>
              <span className="resumen-section-icon">{CATEGORIA_ICONO[cat]}</span>
              <span className="resumen-section-title">{CATEGORIA_LABEL[cat]}</span>
            </button>
            {expanded && (
              <div className="resumen-section-body">
                {items === null && !error && <p className="resumen-status">Cargando…</p>}
                {catItems.map((m) => {
                  const pct = m.total > 0 ? Math.min(100, (m.entregados / m.total) * 100) : 0;
                  const complete = m.total > 0 && m.entregados >= m.total;
                  return (
                    <div className="resumen-item" key={m.materialId}>
                      <span className="resumen-item-icon">{ITEM_ICONO[m.nombre] ?? '•'}</span>
                      <span className="resumen-item-name">{m.nombre}</span>
                      <div className="resumen-item-bar">
                        <div className={`resumen-item-fill${complete ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`resumen-item-count${complete ? ' complete' : ''}`}>
                        {m.entregados}/{m.total}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
