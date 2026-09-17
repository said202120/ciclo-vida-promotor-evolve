'use client';

import { useState } from 'react';
import { fetchEncuestaLink } from '@/lib/api-client';

export default function EncuestaLinkButton({ promotorId }: { promotorId: string }) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'copiado' | 'error'>('idle');

  async function handleClick() {
    setEstado('cargando');
    try {
      const { codigo } = await fetchEncuestaLink(promotorId);
      const url = `${window.location.origin}/e/${codigo}`;
      await navigator.clipboard.writeText(url);
      setEstado('copiado');
    } catch {
      setEstado('error');
    } finally {
      setTimeout(() => setEstado('idle'), 2000);
    }
  }

  return (
    <button type="button" className="encuesta-link-btn" onClick={handleClick} disabled={estado === 'cargando'}>
      {estado === 'copiado' ? '✓ Copiado' : estado === 'error' ? 'Error' : estado === 'cargando' ? '…' : '🔗 Encuesta'}
    </button>
  );
}
