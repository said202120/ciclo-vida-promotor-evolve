'use client';

import { useEffect, useState } from 'react';
import type { RecordatorioMateriales } from '@/lib/types';
import { fetchRecordatoriosMateriales } from '@/lib/api-client';

export default function RecordatoriosMateriales() {
  const [items, setItems] = useState<RecordatorioMateriales[]>([]);

  useEffect(() => {
    fetchRecordatoriosMateriales()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="alert-banner">
      <p className="alert-banner-title">
        🔔 {items.length} {items.length === 1 ? 'promotor cumple' : 'promotores cumplen'} 1 mes de ingreso este mes
      </p>
      <div className="alert-banner-list">
        {items.map((r) => (
          <div className="alert-item" key={r.promotorId}>
            <span className="alert-item-icon">🎒</span>
            <span>
              <span className="alert-item-name">A {r.nombre}</span> se le deben entregar sus materiales el próximo
              mes — verificar con mesa de control.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
