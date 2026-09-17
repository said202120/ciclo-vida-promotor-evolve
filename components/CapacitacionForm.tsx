'use client';

import { useState, type FormEvent } from 'react';
import type { CapacitacionEnvioResultado, CapacitacionPublica } from '@/lib/types';
import { enviarCapacitacion } from '@/lib/api-client';

export default function CapacitacionForm({ codigo, inicial }: { codigo: string; inicial: CapacitacionPublica }) {
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [respuestasAbiertas, setRespuestasAbiertas] = useState<Record<string, string>>(() => {
    const iniciales: Record<string, string> = {};
    for (const p of inicial.preguntas) {
      if (p.campoAbiertoLabel && p.respuestaAbiertaPrevia) iniciales[p.id] = p.respuestaAbiertaPrevia;
    }
    return iniciales;
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<CapacitacionEnvioResultado | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (Object.keys(respuestas).length !== inicial.preguntas.length) {
      setError('Responde todas las preguntas antes de enviar.');
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        respuestas: inicial.preguntas.map((p) => ({ preguntaId: p.id, opcionId: respuestas[p.id] })),
        respuestasAbiertas: inicial.preguntas
          .filter((p) => p.campoAbiertoLabel)
          .map((p) => ({ preguntaId: p.id, texto: respuestasAbiertas[p.id] ?? '' })),
      };
      const res = await enviarCapacitacion(codigo, payload);
      setResultado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el examen.');
    } finally {
      setEnviando(false);
    }
  }

  if (inicial.bloqueado) {
    return (
      <div className="encuesta-wrap">
        <div className="encuesta-card">
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1 className="encuesta-title">Módulo bloqueado</h1>
          <p className="encuesta-hint">
            Hola {inicial.promotorNombre.split(' ')[0]}, {inicial.razonBloqueo}
          </p>
        </div>
      </div>
    );
  }

  if (inicial.preguntas.length === 0) {
    return (
      <div className="encuesta-wrap">
        <div className="encuesta-card">
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1 className="encuesta-title">Todavía no está listo</h1>
          <p className="encuesta-hint">
            El examen de &quot;{inicial.moduloNombre}&quot; todavía no tiene preguntas cargadas. Intenta de nuevo más
            tarde.
          </p>
        </div>
      </div>
    );
  }

  if (resultado) {
    return (
      <div className="encuesta-wrap">
        <div className="encuesta-card">
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1 className="encuesta-title">{resultado.aprobado ? '¡Aprobado!' : 'No alcanzaste el mínimo'}</h1>
          <div className={`capacitacion-resultado ${resultado.aprobado ? 'aprobado' : 'reprobado'}`}>
            <span className="capacitacion-resultado-pct">{resultado.calificacion}%</span>
            <span>Necesitas {resultado.umbralAprobacion}% para aprobar.</span>
          </div>
          {resultado.aprobado ? (
            <p className="encuesta-hint">Ya puedes cerrar esta página.</p>
          ) : (
            <>
              <p className="encuesta-hint">Puedes volver a intentarlo cuando quieras con este mismo link.</p>
              <button
                type="button"
                className="encuesta-submit"
                onClick={() => {
                  setRespuestas({});
                  setResultado(null);
                }}
              >
                Reintentar
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="encuesta-wrap">
      <form className="encuesta-card" onSubmit={handleSubmit}>
        <p className="eyebrow">OKR · Operaciones · Evolve</p>
        <h1 className="encuesta-title">{inicial.moduloNombre}</h1>
        {inicial.moduloDescripcion && <p className="encuesta-hint">{inicial.moduloDescripcion}</p>}
        <p className="encuesta-hint">
          Hola {inicial.promotorNombre.split(' ')[0]}, necesitas {inicial.umbralAprobacion}% para aprobar. Puedes
          reintentar las veces que necesites.
        </p>

        {inicial.resultadoPrevio && (
          <p className="capacitacion-resultado-previo">
            Tu último resultado: {inicial.resultadoPrevio.calificacion}% ·{' '}
            {inicial.resultadoPrevio.aprobado ? 'Aprobado' : 'Reprobado'}
          </p>
        )}

        {inicial.preguntas.map((pregunta, idx) => (
          <div className="capacitacion-quiz-pregunta" key={pregunta.id}>
            <p className="capacitacion-quiz-texto">
              {idx + 1}. {pregunta.texto}
            </p>
            {pregunta.opciones.map((opcion) => (
              <label className="capacitacion-quiz-opcion" key={opcion.id}>
                <input
                  type="radio"
                  name={`pregunta-${pregunta.id}`}
                  checked={respuestas[pregunta.id] === opcion.id}
                  onChange={() => setRespuestas((prev) => ({ ...prev, [pregunta.id]: opcion.id }))}
                  required
                />
                {opcion.texto}
              </label>
            ))}
            {pregunta.campoAbiertoLabel && (
              <label className="capacitacion-quiz-abierto">
                {pregunta.campoAbiertoLabel}
                <input
                  type="text"
                  value={respuestasAbiertas[pregunta.id] ?? ''}
                  onChange={(e) => setRespuestasAbiertas((prev) => ({ ...prev, [pregunta.id]: e.target.value }))}
                  placeholder="Opcional"
                />
              </label>
            )}
          </div>
        ))}

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="encuesta-submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar examen'}
        </button>
      </form>
    </div>
  );
}
