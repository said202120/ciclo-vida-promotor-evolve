'use client';

import { useState } from 'react';
import { fetchEncuestaLink } from '@/lib/api-client';
import type { EncuestaTipo } from '@/lib/encuestas';

const RUTA_POR_TIPO: Record<EncuestaTipo, string> = {
  mesa_control: '/e/',
  materiales: '/m/',
};

export default function EncuestaLinkButton({
  promotorId,
  tipo,
  etiqueta,
}: {
  promotorId: string;
  tipo: EncuestaTipo;
  etiqueta: string;
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'copiado' | 'error'>('idle');

  async function handleClick() {
    setEstado('cargando');
    try {
      const { codigo } = await fetchEncuestaLink(promotorId, tipo);
      const url = `${window.location.origin}${RUTA_POR_TIPO[tipo]}${codigo}`;
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
      {estado === 'copiado' ? '✓ Copiado' : estado === 'error' ? 'Error' : estado === 'cargando' ? '…' : etiqueta}
    </button>
  );
}
