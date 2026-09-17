'use client';

import { useEffect, useRef, useState } from 'react';
import type { MaterialCategoria, MaterialEstado } from '@/lib/types';
import { fetchPromotorMateriales } from '@/lib/api-client';

const CATEGORIA_LABEL: Record<MaterialCategoria, string> = {
  tecnologia: 'Tecnología y sistema',
  trabajo: 'Materiales de trabajo',
};

const CATEGORIAS: MaterialCategoria[] = ['tecnologia', 'trabajo'];

export default function MaterialesCell({
  promotorId,
  entregados,
  total,
  onToggle,
}: {
  promotorId: string;
  entregados: number;
  total: number;
  onToggle: (promotorId: string, materialId: string, entregado: boolean) => Promise<MaterialEstado[]>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MaterialEstado[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchPromotorMateriales(promotorId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el checklist.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(materialId: string, checked: boolean) {
    setItems((prev) => (prev ? prev.map((m) => (m.materialId === materialId ? { ...m, entregado: checked } : m)) : prev));
    try {
      setItems(await onToggle(promotorId, materialId, checked));
    } catch {
      setItems((prev) =>
        prev ? prev.map((m) => (m.materialId === materialId ? { ...m, entregado: !checked } : m)) : prev
      );
    }
  }

  return (
    <div className="materiales-cell" ref={boxRef}>
      <button
        type="button"
        className={`materiales-trigger${total > 0 && entregados >= total ? ' complete' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        {entregados}/{total}
      </button>
      {open && (
        <div className="materiales-popover" role="dialog">
          {loading && <p className="materiales-popover-status">Cargando…</p>}
          {error && <p className="materiales-popover-status materiales-popover-error">{error}</p>}
          {items &&
            !loading &&
            CATEGORIAS.map((cat) => {
              const catItems = items.filter((m) => m.categoria === cat);
              if (catItems.length === 0) return null;
              return (
                <div className="materiales-group" key={cat}>
                  <p className="materiales-group-title">{CATEGORIA_LABEL[cat]}</p>
                  {catItems.map((m) => (
                    <label className="materiales-item" key={m.materialId}>
                      <input
                        type="checkbox"
                        checked={m.entregado}
                        onChange={(e) => toggleItem(m.materialId, e.target.checked)}
                      />
                      {m.nombre}
                    </label>
                  ))}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
