'use client';

import { useState, type FormEvent } from 'react';
import type { EncuestaPublica } from '@/lib/types';
import { enviarEncuesta } from '@/lib/api-client';
import SiNoToggle from './SiNoToggle';

const PUESTOS = ['Promotor', 'Supervisor', 'Demostrador'];

export default function EncuestaForm({ codigo, inicial }: { codigo: string; inicial: EncuestaPublica }) {
  const [marca, setMarca] = useState(inicial.marca);
  const puestoInicialEsOtro = inicial.puesto !== '' && !PUESTOS.includes(inicial.puesto);
  const [puestoSel, setPuestoSel] = useState(puestoInicialEsOtro ? 'Otro' : inicial.puesto);
  const [puestoOtro, setPuestoOtro] = useState(puestoInicialEsOtro ? inicial.puesto : '');

  const [contratoReportado, setContratoReportado] = useState<boolean | null>(inicial.contratoReportado);
  const [imssReportado, setImssReportado] = useState<boolean | null>(inicial.imssReportado);
  const [cartaReportada, setCartaReportada] = useState<boolean | null>(inicial.cartaReportada);
  const [credencialReportada, setCredencialReportada] = useState<boolean | null>(inicial.credencialReportada);
  const [usuarioEmetrixReportado, setUsuarioEmetrixReportado] = useState<boolean | null>(
    inicial.usuarioEmetrixReportado
  );

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const puestoFinal = puestoSel === 'Otro' ? puestoOtro.trim() : puestoSel;
    if (!marca.trim() || !puestoFinal) {
      setError('Completa la marca y el puesto.');
      return;
    }
    const respuestas = [contratoReportado, imssReportado, cartaReportada, credencialReportada, usuarioEmetrixReportado];
    if (respuestas.some((r) => r === null)) {
      setError('Responde todas las preguntas de Sí/No antes de enviar.');
      return;
    }

    setEnviando(true);
    try {
      await enviarEncuesta(codigo, {
        marca: marca.trim(),
        puesto: puestoFinal,
        contratoReportado: contratoReportado!,
        imssReportado: imssReportado!,
        cartaReportada: cartaReportada!,
        credencialReportada: credencialReportada!,
        usuarioEmetrixReportado: usuarioEmetrixReportado!,
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
          <p className="encuesta-hint">Tus respuestas se guardaron correctamente. Ya puedes cerrar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="encuesta-wrap">
      <form className="encuesta-card" onSubmit={handleSubmit}>
        <p className="eyebrow">OKR · Operaciones · Evolve</p>
        <h1 className="encuesta-title">Verificación de nuevo ingreso</h1>
        <p className="encuesta-hint">
          Contesta con calma. Puedes volver a abrir este mismo link más tarde si necesitas corregir algo.
        </p>

        <section className="encuesta-bloque">
          <h2>Datos generales</h2>
          <div className="encuesta-campo">
            <span>Nombre</span>
            <p className="encuesta-nombre">{inicial.promotorNombre}</p>
          </div>
          <label className="encuesta-campo">
            Marca a la que ingresas
            <input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} required />
          </label>
          <label className="encuesta-campo">
            Puesto
            <select value={puestoSel} onChange={(e) => setPuestoSel(e.target.value)} required>
              <option value="" disabled>
                Selecciona…
              </option>
              {PUESTOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="Otro">Otro</option>
            </select>
          </label>
          {puestoSel === 'Otro' && (
            <label className="encuesta-campo">
              Especifica tu puesto
              <input type="text" value={puestoOtro} onChange={(e) => setPuestoOtro(e.target.value)} required />
            </label>
          )}
        </section>

        <section className="encuesta-bloque">
          <h2>Administrativo</h2>
          <SiNoToggle label="¿Ya firmaste tu contrato?" value={contratoReportado} onChange={setContratoReportado} />
          <SiNoToggle
            label="¿Ya confirmaste tu alta ante el IMSS?"
            value={imssReportado}
            onChange={setImssReportado}
          />
          <SiNoToggle
            label="¿Ya recibiste tu carta de acceso a tienda?"
            value={cartaReportada}
            onChange={setCartaReportada}
          />
          <SiNoToggle
            label="¿Ya tienes tu credencial de la empresa?"
            value={credencialReportada}
            onChange={setCredencialReportada}
          />
          <SiNoToggle
            label="¿Ya te proporcionaron tu usuario de Emetrix?"
            value={usuarioEmetrixReportado}
            onChange={setUsuarioEmetrixReportado}
          />
        </section>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="encuesta-submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar respuestas'}
        </button>
      </form>
    </div>
  );
}
