'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCargaPreview, EmetrixFilaDetalle, EmetrixKr, EmetrixResultadoKr } from '@/lib/types';
import {
  emetrixPonderacionDetalleExcelUrl,
  fetchDetalleEmetrixPonderacion,
  fetchIncluyeCelularConfigEmetrixPonderacion,
  guardarCargaEmetrixPonderacion,
  parseEmetrixPonderacion,
} from '@/lib/api-client';

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
  const [detalle, setDetalle] = useState<EmetrixFilaDetalle[] | null>(null);
  const [mostrandoDetalle, setMostrandoDetalle] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const faltaCelular = requiereCelular && incluyeCelular === '';
  const puedeSubir = !!marcaId && !faltaCelular;
  const cargado = !!estado?.cargadoEn;

  // Al cambiar de cuenta: si es Materiales, precarga si ya se sabe que incluye celular (sigue siendo editable).
  useEffect(() => {
    setMostrandoDetalle(false);
    setDetalle(null);
    if (!marcaId || !requiereCelular) {
      setIncluyeCelular('');
      return;
    }
    fetchIncluyeCelularConfigEmetrixPonderacion(marcaId)
      .then((res) => setIncluyeCelular(res.incluyeCelular === null ? '' : res.incluyeCelular ? 'si' : 'no'))
      .catch(() => setIncluyeCelular(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaId]);

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
        filas: preview.filas,
      });
      setGuardado(true);
      if (mostrandoDetalle) cargarDetalle();
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la carga.');
    } finally {
      setGuardando(false);
    }
  }

  function cargarDetalle() {
    setCargandoDetalle(true);
    fetchDetalleEmetrixPonderacion(marcaId, kr)
      .then((res) => setDetalle(res?.filas ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle.'))
      .finally(() => setCargandoDetalle(false));
  }

  function handleToggleDetalle() {
    const next = !mostrandoDetalle;
    setMostrandoDetalle(next);
    if (next && detalle === null) cargarDetalle();
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
              Total de promotores de la cuenta (headcount)
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
                {preview.universoEsManual ? '' : ` (${preview.totalFilas} promotores únicos contestaron)`}
              </p>
              {!preview.universoEsManual && (
                <p className="emetrix-warning">⚠️ Resultado solo entre quienes contestaron, sin headcount total.</p>
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

          {cargado && (
            <div className="emetrix-detalle">
              <button type="button" className="add-row" onClick={handleToggleDetalle}>
                {mostrandoDetalle ? 'Ocultar detalle por promotor' : 'Ver detalle por promotor'}
              </button>
              {mostrandoDetalle && (
                <>
                  {cargandoDetalle ? (
                    <p className="resumen-status">Cargando…</p>
                  ) : (
                    <>
                      <div className="emetrix-detalle-tabla-wrap">
                        <table className="roster-table">
                          <thead>
                            <tr>
                              <th>Usuario</th>
                              <th>Posición</th>
                              <th>Cumple</th>
                              <th>Detalle</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(detalle ?? []).map((f) => (
                              <tr key={f.usuario}>
                                <td style={{ textAlign: 'left' }}>{f.usuario}</td>
                                <td>{f.posicion}</td>
                                <td>{f.cumple ? '✓' : '✕'}</td>
                                <td style={{ textAlign: 'left' }}>{f.detalleFalla ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <a className="add-row" href={emetrixPonderacionDetalleExcelUrl(marcaId, kr)}>
                        ⇩ Descargar en Excel
                      </a>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
