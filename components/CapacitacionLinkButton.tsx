'use client';

import { useState } from 'react';
import { fetchCapacitacionLink } from '@/lib/api-client';

export default function CapacitacionLinkButton({
  promotorId,
  moduloId,
  moduloNombre,
  resultado,
}: {
  promotorId: string;
  moduloId: string;
  moduloNombre: string;
  resultado: { calificacion: number; aprobado: boolean } | undefined;
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'copiado' | 'error'>('idle');

  async function handleClick() {
    setEstado('cargando');
    try {
      const { codigo } = await fetchCapacitacionLink(promotorId, moduloId);
      const url = `${window.location.origin}/q/${codigo}`;
      await navigator.clipboard.writeText(url);
      setEstado('copiado');
    } catch {
      setEstado('error');
    } finally {
      setTimeout(() => setEstado('idle'), 2000);
    }
  }

  return (
    <div className="capacitacion-cell">
      <span className={`capacitacion-badge${resultado ? (resultado.aprobado ? ' aprobado' : ' reprobado') : ''}`}>
        {resultado ? `${resultado.calificacion}%` : 'Sin presentar'}
      </span>
      <button type="button" className="encuesta-link-btn" onClick={handleClick} disabled={estado === 'cargando'}>
        {estado === 'copiado' ? '✓ Copiado' : estado === 'error' ? 'Error' : estado === 'cargando' ? '…' : `🎓 ${moduloNombre}`}
      </button>
    </div>
  );
}
