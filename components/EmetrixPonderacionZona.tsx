'use client';

import { useState } from 'react';
import type { EmetrixCargaPreview, EmetrixKr, EmetrixResultadoKr } from '@/lib/types';
import { guardarCargaEmetrixPonderacion, parseEmetrixPonderacion } from '@/lib/api-client';

const KR_LABEL: Record<EmetrixKr, string> = {
  mesa_control: 'Mesa de Control',
  materiales: 'Materiales',
  marca: 'Marca',
};

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmetrixPonderacionZona({
  kr,
  marcaId,
  estado,
  requiereCelular,
  onGuardado,
}: {
  kr: EmetrixKr;
  marcaId: string;
  estado: EmetrixResultadoKr | undefined;
  requiereCelular: boolean;
  onGuardado: () => void;
}) {
  const [universo, setUniverso] = useState('');
  const [incluyeCelular, setIncluyeCelular] = useState<'si' | 'no' | ''>('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmetrixCargaPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const faltaCelular = requiereCelular && incluyeCelular === '';
  const puedeSubir = !!marcaId && !faltaCelular;
  const cargado = !!estado?.cargadoEn;

  async function handleArchivo(file: File) {
    setError(null);
    setPreview(null);
    setGuardado(false);
    setArchivo(file);
    setProcesando(true);
    try {
      const universoManual = universo.trim() ? parseInt(universo, 10) : null;
      const res = await parseEmetrixPonderacion(file, kr, universoManual, requiereCelular ? incluyeCelular === 'si' : null);
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar el archivo.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleGuardar() {
    if (!preview || !archivo || !marcaId) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarCargaEmetrixPonderacion({
        marcaId,
        kr,
        totalFilas: preview.totalFilas,
        universoManual: preview.universoEsManual ? preview.universoUsado : null,
        cumplieron: preview.cumplieron,
        incluyeCelular: requiereCelular ? incluyeCelular === 'si' : null,
        archivoNombre: archivo.name,
      });
      setGuardado(true);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la carga.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="roster emetrix-zona">
      <div className="roster-head">
        <p className="section-title" style={{ margin: 0 }}>
          {KR_LABEL[kr]}
        </p>
        <span className={`emetrix-estatus-badge ${cargado ? 'cargado' : 'pendiente'}`}>
          {cargado ? `✓ Cargado · ${formatFecha(estado!.cargadoEn!)}` : 'Falta cargar'}
        </span>
      </div>

      {!marcaId ? (
        <p className="roster-hint">Selecciona una cuenta arriba para cargar este KR.</p>
      ) : (
        <>
          <form className="users-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Universo total de la cuenta (headcount)
              <input
                type="number"
                min={1}
                placeholder="Opcional — deja vacío para usar solo respondientes"
                value={universo}
                onChange={(e) => {
                  setUniverso(e.target.value);
                  setPreview(null);
                  setGuardado(false);
                }}
              />
            </label>
            {requiereCelular && (
              <label>
                ¿Esta cuenta incluye celular en el acuerdo comercial?
                <select
                  value={incluyeCelular}
                  onChange={(e) => {
                    setIncluyeCelular(e.target.value as 'si' | 'no' | '');
                    setPreview(null);
                    setGuardado(false);
                  }}
                >
                  <option value="">Selecciona…</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </label>
            )}
            <label>
              Archivo (.xlsx / .csv)
              <input
                type="file"
                accept=".xlsx,.xlsm,.csv"
                disabled={!puedeSubir}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleArchivo(file);
                }}
              />
            </label>
          </form>

          {faltaCelular && <p className="roster-hint">Indica si la cuenta incluye celular para poder subir el archivo.</p>}
          {procesando && <p className="resumen-status">Procesando…</p>}
          {error && <p className="login-error">{error}</p>}

          {preview && (
            <div className="emetrix-preview">
              <p>
                <strong>{preview.cumplieron}</strong> de <strong>{preview.universoUsado}</strong> cumplieron ·{' '}
                <strong>{preview.porcentaje}%</strong>
                {preview.universoEsManual ? '' : ` (${preview.totalFilas} respondieron el sondeo)`}
              </p>
              {!preview.universoEsManual && (
                <p className="emetrix-warning">⚠️ Sin headcount real, usando solo respondientes — el % puede estar inflado.</p>
              )}
              {guardado ? (
                <p className="emetrix-guardado">✓ Carga guardada.</p>
              ) : (
                <button type="button" className="close-month-btn" onClick={handleGuardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar carga'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
