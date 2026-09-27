'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCargaPreview, EmetrixEstado, EmetrixFilaDetalle, EmetrixKr, EmetrixPreguntaResumen, EmetrixUniversoFuente } from '@/lib/types';
import { emetrixPonderacionDetalleExcelUrl, fetchDetalleEmetrixPonderacion, guardarCargaEmetrixPonderacion, parseEmetrixPonderacion } from '@/lib/api-client';

const KR_LABEL: Record<EmetrixKr, string> = {
  mesa_control: 'Mesa de Control',
  materiales: 'Materiales',
  marca: 'Marca',
};

const ESTADO_LABEL: Record<EmetrixEstado, string> = {
  cumple: '✓ Cumple',
  no_cumple: '✕ No cumple',
  no_contesto: '— No contestó',
};

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const MESA_CONTROL_PREGUNTAS_OKR = ['Entrada a tienda', 'Emetrix funcionó'];

/**
 * Mesa de Control alimenta 2 de los 4 KPI de KR1 (Carta de acceso y
 * credencial, Usuario en Emetrix) — no las 4 preguntas del sondeo. El % que
 * muestra esta tarjeta debe ser el mismo que ve KR1 en el árbol OKR (promedio
 * de esas 2 preguntas, no la regla vieja de "Sí a las 4"), para que no haya
 * dos cifras distintas del mismo sondeo en pantalla. Mismo promedio simple
 * que agregarNodoOkr en el servidor (ambas preguntas pesan igual dentro de
 * KR1) — null si ninguna se reconoció en el archivo.
 */
function porcentajeOkrMesaControl(preguntas: EmetrixPreguntaResumen[]): number | null {
  const valores = MESA_CONTROL_PREGUNTAS_OKR.map((label) => preguntas.find((p) => p.pregunta === label)?.porcentaje ?? null).filter(
    (v): v is number => v !== null
  );
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 100) / 100;
}

export default function EmetrixPonderacionZona({
  kr,
  marcaId,
  cargadoEn,
  requiereCelular,
  incluyeCelularGuardado,
  headcountCuenta,
  onGuardado,
}: {
  kr: EmetrixKr;
  marcaId: string;
  /** Fecha de la carga más reciente de este sondeo para la cuenta, o null si todavía no se ha cargado ninguna. */
  cargadoEn: string | null;
  requiereCelular: boolean;
  /** Si la cuenta ya tiene guardado si incluye celular (Materiales). Sigue siendo editable aquí, solo se usa para precargar. */
  incluyeCelularGuardado: boolean | null;
  /** Headcount de la cuenta (uno solo, capturado arriba en el panel de la cuenta). Solo para mostrar contexto en el override — el cálculo lo aplica el servidor. */
  headcountCuenta: number | null;
  onGuardado: () => void;
}) {
  const [universoOverride, setUniversoOverride] = useState('');
  const [incluyeCelular, setIncluyeCelular] = useState<'si' | 'no' | ''>('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmetrixCargaPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [detalle, setDetalle] = useState<{
    universoFuente: EmetrixUniversoFuente;
    usuariosNoEncontrados: string[];
    filas: EmetrixFilaDetalle[];
    preguntas: EmetrixPreguntaResumen[];
  } | null>(null);
  const [mostrandoDetalle, setMostrandoDetalle] = useState(false);
  const [mostrandoPreguntas, setMostrandoPreguntas] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const faltaCelular = requiereCelular && incluyeCelular === '';
  const puedeSubir = !!marcaId && !faltaCelular;
  const cargado = !!cargadoEn;

  // Al cambiar de cuenta: si es Materiales, precarga si ya se sabe que incluye celular (sigue siendo editable).
  useEffect(() => {
    setMostrandoDetalle(false);
    setMostrandoPreguntas(false);
    setDetalle(null);
    setUniversoOverride('');
    setIncluyeCelular(requiereCelular && incluyeCelularGuardado !== null ? (incluyeCelularGuardado ? 'si' : 'no') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaId]);

  async function handleArchivo(file: File) {
    setError(null);
    setPreview(null);
    setGuardado(false);
    setArchivo(file);
    setProcesando(true);
    try {
      const override = universoOverride.trim() ? parseInt(universoOverride, 10) : null;
      const res = await parseEmetrixPonderacion(file, marcaId, kr, override, requiereCelular ? incluyeCelular === 'si' : null);
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
        preview,
        incluyeCelular: requiereCelular ? incluyeCelular === 'si' : null,
        archivoNombre: archivo.name,
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
      .then((res) =>
        setDetalle(
          res
            ? { universoFuente: res.universoFuente, usuariosNoEncontrados: res.usuariosNoEncontrados, filas: res.filas, preguntas: res.preguntas }
            : null
        )
      )
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle.'))
      .finally(() => setCargandoDetalle(false));
  }

  function handleToggleDetalle() {
    const next = !mostrandoDetalle;
    setMostrandoDetalle(next);
    if (next && detalle === null) cargarDetalle();
  }

  function handleTogglePreguntas() {
    const next = !mostrandoPreguntas;
    setMostrandoPreguntas(next);
    if (next && detalle === null) cargarDetalle();
  }

  return (
    <div className="roster emetrix-zona">
      <div className="roster-head">
        <p className="section-title" style={{ margin: 0 }}>
          {KR_LABEL[kr]}
        </p>
        <span className={`emetrix-estatus-badge ${cargado ? 'cargado' : 'pendiente'}`}>
          {cargado ? `✓ Cargado · ${formatFecha(cargadoEn!)}` : 'Falta cargar'}
        </span>
      </div>

      {!marcaId ? (
        <p className="roster-hint">Selecciona una cuenta arriba para cargar este KR.</p>
      ) : (
        <>
          <form className="users-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Ajustar universo solo para este sondeo (opcional)
              <input
                type="number"
                min={1}
                placeholder={headcountCuenta !== null ? `Usa el headcount de la cuenta (${headcountCuenta})` : 'Sin headcount de cuenta capturado'}
                value={universoOverride}
                onChange={(e) => {
                  setUniversoOverride(e.target.value);
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
              <p className="emetrix-cumplimiento-principal">
                Cumplimiento:{' '}
                {kr === 'mesa_control'
                  ? (() => {
                      const p = porcentajeOkrMesaControl(preview.preguntas);
                      return p !== null ? `${p}%` : 'No reconocido en este archivo';
                    })()
                  : `${preview.porcentaje}%`}
              </p>
              {kr === 'mesa_control' && (
                <p className="roster-hint">
                  Promedio de "Entrada a tienda" y "Emetrix funcionó" (los 2 KPI de KR1 en el OKR) — no el % de las 4
                  preguntas del sondeo completo.
                </p>
              )}
              <p>
                {preview.universoFuente === 'sin_universo'
                  ? `Contestaron ${preview.respondieron} promotores (no se definió el total del equipo)`
                  : `Contestaron ${preview.respondieron} de ${preview.universoUsado} promotores (${preview.porcentajeRespuesta}%)`}
              </p>
              {preview.universoFuente === 'sin_universo' ? (
                <p className="emetrix-nota">No se definió el total de promotores de esta cuenta.</p>
              ) : (
                preview.enAlerta && <p className="emetrix-nota">Contestó menos del {preview.umbralRespuesta}% del equipo.</p>
              )}

              <details className="emetrix-detalle-tecnico">
                <summary>Ver detalle técnico</summary>
                {preview.diagnostico.formatoLargo && <p className="roster-hint">{preview.diagnostico.formatoLargo}</p>}
                <p className="roster-hint">
                  Filas leídas: {preview.diagnostico.filasLeidas} · descartadas:{' '}
                  {preview.diagnostico.filasSinUsuario + preview.diagnostico.filasDuplicadas} (sin USUARIO: {preview.diagnostico.filasSinUsuario},
                  duplicadas: {preview.diagnostico.filasDuplicadas}) · promotores únicos del archivo:{' '}
                  {preview.diagnostico.filasLeidas - preview.diagnostico.filasSinUsuario - preview.diagnostico.filasDuplicadas}
                </p>
              </details>

              {preview.preguntas.length > 0 && (
                <details className="emetrix-detalle-tecnico">
                  <summary>Ver resultado por pregunta</summary>
                  <TablaPreguntas preguntas={preview.preguntas} />
                </details>
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="add-row" onClick={handleToggleDetalle}>
                  {mostrandoDetalle ? 'Ocultar detalle por promotor' : 'Ver detalle por promotor'}
                </button>
                <button type="button" className="add-row" onClick={handleTogglePreguntas}>
                  {mostrandoPreguntas ? 'Ocultar resultado por pregunta' : 'Ver resultado por pregunta'}
                </button>
              </div>
              {mostrandoPreguntas && (cargandoDetalle ? <p className="resumen-status">Cargando…</p> : <TablaPreguntas preguntas={detalle?.preguntas ?? []} />)}
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
                              <th>Estado</th>
                              <th>Detalle</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(detalle?.filas ?? []).map((f) => (
                              <tr key={f.promotorId ?? f.usuario}>
                                <td style={{ textAlign: 'left' }}>{f.usuario}</td>
                                <td>{f.posicion}</td>
                                <td>{ESTADO_LABEL[f.estado]}</td>
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

/** % de "Sí" (o de respuesta correcta en Tu Marca) de cada pregunta, sobre quienes la contestaron con un valor reconocible. */
function TablaPreguntas({ preguntas }: { preguntas: EmetrixPreguntaResumen[] }) {
  if (preguntas.length === 0) return <p className="resumen-status">Sin datos.</p>;
  return (
    <div className="emetrix-detalle-tabla-wrap">
      <table className="roster-table">
        <thead>
          <tr>
            <th>Pregunta</th>
            <th>% Sí / correcta</th>
            <th>Contestaron</th>
          </tr>
        </thead>
        <tbody>
          {preguntas.map((p) => (
            <tr key={p.pregunta}>
              <td style={{ textAlign: 'left' }}>{p.pregunta}</td>
              <td>{p.porcentaje !== null ? `${p.porcentaje}%` : 'No reconocida en este archivo'}</td>
              <td>{p.contestaron}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
