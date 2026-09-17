'use client';

import { useState, type FormEvent } from 'react';
import type { EncuestaMaterialesPublica } from '@/lib/types';
import { enviarEncuestaMateriales } from '@/lib/api-client';
import SiNoToggle from './SiNoToggle';

export default function EncuestaMaterialesForm({
  codigo,
  inicial,
}: {
  codigo: string;
  inicial: EncuestaMaterialesPublica;
}) {
  const [fechaEntregaComunicada, setFechaEntregaComunicada] = useState<boolean | null>(
    inicial.fechaEntregaComunicada
  );
  const [materiales, setMateriales] = useState<Set<string>>(
    new Set(inicial.materiales.filter((m) => m.recibido).map((m) => m.materialId))
  );

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  function toggleMaterial(id: string, checked: boolean) {
    setMateriales((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (fechaEntregaComunicada === null) {
      setError('Responde la pregunta de arriba antes de enviar.');
      return;
    }

    setEnviando(true);
    try {
      await enviarEncuestaMateriales(codigo, {
        fechaEntregaComunicada,
        materiales: [...materiales],
      });
      setEnviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la encuesta.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="encuesta-wrap">
        <div className="encuesta-card">
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1 className="encuesta-title">¡Gracias, {inicial.promotorNombre.split(' ')[0]}!</h1>
          <p className="encuesta-hint">
            Tus respuestas se guardaron correctamente. Puedes volver a abrir este mismo link más adelante para
            actualizar tu checklist conforme vayas recibiendo tus materiales.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="encuesta-wrap">
      <form className="encuesta-card" onSubmit={handleSubmit}>
        <p className="eyebrow">OKR · Operaciones · Evolve</p>
        <h1 className="encuesta-title">Materiales de trabajo</h1>
        <p className="encuesta-hint">
          Hola {inicial.promotorNombre.split(' ')[0]}. Puedes volver a abrir este mismo link para actualizar tu
          checklist conforme vayas recibiendo tus materiales.
        </p>

        <section className="encuesta-bloque">
          <SiNoToggle
            label="¿Tu ejecutivo de cuenta ya te dejó clara la fecha en que se te van a entregar tus materiales de trabajo?"
            value={fechaEntregaComunicada}
            onChange={setFechaEntregaComunicada}
          />
        </section>

        <section className="encuesta-bloque">
          <h2>Checklist de materiales</h2>
          <p className="encuesta-subtitulo">
            Marca los artículos que ya recibiste. No es necesario llenarlo todo en esta primera visita — puedes
            volver a entrar cuando te vayan entregando el resto.
          </p>
          <div className="encuesta-materiales">
            {inicial.materiales.map((m) => (
              <label key={m.materialId} className="encuesta-material-item">
                <input
                  type="checkbox"
                  checked={materiales.has(m.materialId)}
                  onChange={(e) => toggleMaterial(m.materialId, e.target.checked)}
                />
                {m.nombre}
              </label>
            ))}
          </div>
        </section>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="encuesta-submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar respuestas'}
        </button>
      </form>
    </div>
  );
}
