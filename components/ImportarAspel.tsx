'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ImportAplicarResultado,
  ImportCampo,
  ImportLogEntry,
  ImportMapeo,
  ImportParseResult,
  PromotorParaImportar,
  Usuario,
} from '@/lib/types';
import {
  aplicarImportacion,
  fetchImportConfig,
  fetchImportLog,
  fetchMe,
  fetchPromotoresParaImportar,
  logout,
  parseImportFile,
  saveImportConfig,
} from '@/lib/api-client';
import { extractRegistros, parseFlexibleDate } from '@/lib/import-shared';
import { CAMPOS_PERMITIDOS, esRolImportador, type RolImportador } from '@/lib/import-permisos';

const PREVIEW_ROWS = 5;

const CAMPO_LABEL: Record<ImportCampo, string> = {
  rfc: 'RFC',
  contratoFecha: 'Fecha de contrato firmado',
  imssFecha: 'Fecha de alta IMSS',
  cartaFecha: 'Carta de ingreso',
  emetrixFecha: 'Usuario Emetrix',
  ignorar: 'Ignorar esta columna',
};

const ROL_LABEL: Record<RolImportador, string> = {
  mesa_control: 'Mesa de Control',
  nomina: 'Nómina',
};

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (diacriticos combinados tras normalize('NFD'))
    .toLowerCase()
    .trim();
}

/** Adivina el campo por el nombre del encabezado, solo entre los campos que el rol puede usar. */
function detectCampoByName(header: string, yaAsignados: Set<ImportCampo>, permitidos: ImportCampo[]): ImportCampo {
  const norm = normalizeHeader(header);
  if (permitidos.includes('rfc') && !yaAsignados.has('rfc') && /\brfc\b/.test(norm)) return 'rfc';
  if (permitidos.includes('contratoFecha') && !yaAsignados.has('contratoFecha') && norm.includes('contrato')) {
    return 'contratoFecha';
  }
  if (permitidos.includes('imssFecha') && !yaAsignados.has('imssFecha') && norm.includes('imss')) return 'imssFecha';
  if (permitidos.includes('cartaFecha') && !yaAsignados.has('cartaFecha') && norm.includes('carta')) return 'cartaFecha';
  if (permitidos.includes('emetrixFecha') && !yaAsignados.has('emetrixFecha') && norm.includes('emetrix')) {
    return 'emetrixFecha';
  }
  return 'ignorar';
}

/** Mapeo guardado primero (columna por columna); lo que falte se adivina por nombre; el resto queda en "ignorar". */
function proposeMapeo(headers: string[], savedConfig: ImportMapeo | null, permitidos: ImportCampo[]): ImportMapeo {
  const proposed: ImportMapeo = {};
  const yaAsignados = new Set<ImportCampo>();
  const pendientes: string[] = [];

  for (const h of headers) {
    const saved = savedConfig?.[h];
    if (saved && permitidos.includes(saved)) {
      proposed[h] = saved;
      if (saved !== 'ignorar') yaAsignados.add(saved);
    } else {
      pendientes.push(h);
    }
  }
  for (const h of pendientes) {
    const campo = detectCampoByName(h, yaAsignados, permitidos);
    proposed[h] = campo;
    if (campo !== 'ignorar') yaAsignados.add(campo);
  }
  return proposed;
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function validateMapeo(mapeo: ImportMapeo, rol: RolImportador | null): string | null {
  if (!rol) return 'Cargando permisos…';
  const camposUnicos = CAMPOS_PERMITIDOS[rol].filter((c) => c !== 'rfc');
  const values = Object.values(mapeo);

  if (values.filter((c) => c === 'rfc').length !== 1) {
    return 'Asigna una columna a RFC.';
  }
  for (const campo of camposUnicos) {
    if (values.filter((c) => c === campo).length > 1) {
      return `Solo una columna puede ser "${CAMPO_LABEL[campo]}".`;
    }
  }
  if (camposUnicos.length > 0 && !camposUnicos.some((c) => values.includes(c))) {
    return `Asigna al menos una columna a ${camposUnicos.map((c) => CAMPO_LABEL[c]).join(' o ')}.`;
  }
  return null;
}

export default function ImportarAspel() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const rol: RolImportador | null = usuario && esRolImportador(usuario.rol) ? usuario.rol : null;
  const campoOptions: ImportCampo[] = rol ? [...CAMPOS_PERMITIDOS[rol], 'ignorar'] : [];

  const [savedConfig, setSavedConfig] = useState<ImportMapeo | null>(null);
  const [mapeo, setMapeo] = useState<ImportMapeo>({});
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);

  const [promotores, setPromotores] = useState<PromotorParaImportar[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ImportAplicarResultado | null>(null);
  const [history, setHistory] = useState<ImportLogEntry[] | null>(null);

  function reloadHistory() {
    fetchImportLog()
      .then(setHistory)
      .catch(() => setHistory([]));
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  useEffect(() => {
    fetchMe()
      .then(setUsuario)
      .catch(() => setUsuario(null));
    fetchImportConfig()
      .then(setSavedConfig)
      .catch(() => setSavedConfig({}));
    fetchPromotoresParaImportar()
      .then(setPromotores)
      .catch(() => setPromotores([]));
    reloadHistory();
  }, []);

  useEffect(() => {
    if (!parsed || !rol) return;
    setMapeo(proposeMapeo(parsed.headers, savedConfig, campoOptions));
    setMappingSaved(false);
    setMappingError(null);
    setApplyResult(null);
    setApplyError(null);
    // Solo se recalcula al parsear un archivo nuevo, no en cada cambio manual del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, rol]);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setParsed(null);
    setFileName(file.name);
    try {
      setParsed(await parseImportFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setParsed(null);
    setFileName(null);
    setError(null);
    setMapeo({});
    setApplyResult(null);
    setApplyError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleMapeoChange(header: string, campo: ImportCampo) {
    setMapeo((prev) => ({ ...prev, [header]: campo }));
    setMappingSaved(false);
    setMappingError(null);
  }

  async function handleSaveMapeo() {
    const validationError = validateMapeo(mapeo, rol);
    if (validationError) {
      setMappingError(validationError);
      setMappingSaved(false);
      return;
    }
    setMappingSaving(true);
    setMappingError(null);
    try {
      const saved = await saveImportConfig(mapeo);
      setSavedConfig(saved);
      setMappingSaved(true);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'No se pudo guardar el mapeo.');
    } finally {
      setMappingSaving(false);
    }
  }

  const mapeoValida = parsed !== null && validateMapeo(mapeo, rol) === null;

  const registros = useMemo(() => {
    if (!parsed || !mapeoValida) return [];
    return extractRegistros(parsed.headers, parsed.rows, mapeo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapeo, mapeoValida]);

  const promotorPorRfc = useMemo(() => {
    const m = new Map<string, PromotorParaImportar>();
    for (const p of promotores ?? []) {
      if (p.rfc) m.set(p.rfc.trim().toUpperCase(), p);
    }
    return m;
  }, [promotores]);

  const preview = useMemo(
    () =>
      registros.map((r) => ({
        ...r,
        promotor: r.rfc ? (promotorPorRfc.get(r.rfc) ?? null) : null,
        contratoFechaParsed: r.contratoFecha ? parseFlexibleDate(r.contratoFecha) : null,
        imssFechaParsed: r.imssFecha ? parseFlexibleDate(r.imssFecha) : null,
        cartaFechaParsed: r.cartaFecha ? parseFlexibleDate(r.cartaFecha) : null,
        emetrixFechaParsed: r.emetrixFecha ? parseFlexibleDate(r.emetrixFecha) : null,
      })),
    [registros, promotorPorRfc]
  );

  const conRfc = preview.filter((p) => p.rfc);
  const conMatch = conRfc.filter((p) => p.promotor);
  const sinMatchPreview = conRfc.filter((p) => !p.promotor);

  const camposAAplicar = rol
    ? CAMPOS_PERMITIDOS[rol].filter((c) => c !== 'rfc' && Object.values(mapeo).includes(c))
    : [];

  async function handleAplicar() {
    setApplying(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const resultado = await aplicarImportacion(
        conRfc.map(({ rfc, contratoFecha, imssFecha, cartaFecha, emetrixFecha }) => ({
          rfc,
          contratoFecha,
          imssFecha,
          cartaFecha,
          emetrixFecha,
        }))
      );
      setApplyResult(resultado);
      reloadHistory();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'No se pudo aplicar la importación.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve{rol && ` · ${ROL_LABEL[rol]}`}</p>
          <h1>Importar actualización de Aspel</h1>
        </div>
        <button type="button" className="topbar-link" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>

      {rol && (
        <p className="roster-hint" style={{ margin: '-8px 0 20px' }}>
          {rol === 'mesa_control'
            ? 'Puedes mapear y aplicar RFC, Fecha de contrato firmado, Carta de ingreso y Usuario Emetrix. El estatus de IMSS se muestra de solo lectura, no se puede editar desde aquí.'
            : 'Puedes mapear y aplicar RFC y Fecha de alta IMSS.'}
        </p>
      )}

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Paso 1 · Subir archivo
        </p>
        <p className="roster-hint">
          Sube el archivo que exporta Aspel (.xlsx o .csv). Todavía no se toca ningún dato — primero vas a revisar
          cómo se leyó y después vas a decir qué columna es cuál.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {fileName && (
          <button type="button" className="add-row" style={{ marginLeft: 12 }} onClick={handleReset}>
            Elegir otro archivo
          </button>
        )}
        {loading && <p className="resumen-status">Leyendo {fileName}…</p>}
        {error && <p className="login-error">{error}</p>}
      </div>

      {parsed && (
        <div className="roster">
          <p className="section-title" style={{ margin: '0 0 14px' }}>
            Paso 2 · Previsualización
          </p>
          <p className="roster-hint">
            {parsed.rows.length} fila{parsed.rows.length === 1 ? '' : 's'} de datos detectada
            {parsed.rows.length === 1 ? '' : 's'} en <strong>{fileName}</strong>. Se muestran las primeras{' '}
            {Math.min(PREVIEW_ROWS, parsed.rows.length)}.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="roster-table">
              <thead>
                <tr>
                  {parsed.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, PREVIEW_ROWS).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ textAlign: 'left' }}>
                        {cell || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parsed && (
        <div className="roster">
          <p className="section-title" style={{ margin: '0 0 14px' }}>
            Paso 3 · Mapeo de columnas
          </p>
          <p className="roster-hint">
            Ya preseleccionamos lo que reconocimos por el nombre del encabezado (por ejemplo, una columna "RFC" o
            "Fecha contrato firmado"). Revisa que quede bien y ajusta lo que haga falta — lo demás queda en "Ignorar
            esta columna". La próxima vez que subas un archivo con esta misma estructura se va a proponer el mapeo
            que confirmes aquí.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Columna del archivo</th>
                  <th>Corresponde a</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((h) => (
                  <tr key={h}>
                    <td style={{ textAlign: 'left' }}>{h}</td>
                    <td>
                      <select
                        className={mapeo[h] && mapeo[h] !== 'ignorar' ? 'mapeo-set' : ''}
                        value={mapeo[h] ?? 'ignorar'}
                        onChange={(e) => handleMapeoChange(h, e.target.value as ImportCampo)}
                      >
                        {campoOptions.map((c) => (
                          <option key={c} value={c}>
                            {CAMPO_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mappingError && <p className="login-error">{mappingError}</p>}
          {mappingSaved && !mappingError && (
            <p className="resumen-status import-success">
              Mapeo guardado. La próxima carga con esta estructura lo propondrá automáticamente.
            </p>
          )}
          <button
            type="button"
            className="close-month-btn"
            onClick={handleSaveMapeo}
            disabled={mappingSaving}
            style={{ marginTop: 12 }}
          >
            {mappingSaving ? 'Guardando…' : 'Guardar mapeo y continuar'}
          </button>
        </div>
      )}

      {parsed && mapeoValida && (
        <div className="roster">
          <p className="section-title" style={{ margin: '0 0 14px' }}>
            Paso 4 · Vista previa de cambios
          </p>
          <p className="roster-hint">
            Todavía no se aplica nada. {conRfc.length} fila{conRfc.length === 1 ? '' : 's'} con RFC en el archivo —{' '}
            <strong>{conMatch.length}</strong> con coincidencia en el padrón
            {sinMatchPreview.length > 0 && (
              <>
                {' '}
                y <strong>{sinMatchPreview.length}</strong> sin coincidencia
              </>
            )}
            {preview.length > conRfc.length && (
              <> · {preview.length - conRfc.length} fila{preview.length - conRfc.length === 1 ? '' : 's'} sin RFC en el archivo, se omiten.</>
            )}
          </p>
          {!promotores ? (
            <p className="resumen-status">Cargando padrón…</p>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>RFC del archivo</th>
                    <th>Promotor</th>
                    <th>Se va a marcar</th>
                    <th>Fecha detectada</th>
                    {rol === 'mesa_control' && <th>IMSS actual (solo lectura)</th>}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      <td className="mono">{row.rfc || '— (sin RFC)'}</td>
                      <td style={{ textAlign: 'left' }}>
                        {!row.rfc ? (
                          <span className="muted">se omite</span>
                        ) : row.promotor ? (
                          row.promotor.nombre
                        ) : (
                          <span className="resumen-error">Sin coincidencia</span>
                        )}
                      </td>
                      <td>
                        {row.rfc && row.promotor ? (
                          <>
                            {row.contratoFecha && <span className="pill good">Contrato ✓</span>}{' '}
                            {row.imssFecha && <span className="pill good">IMSS ✓</span>}{' '}
                            {row.cartaFecha && <span className="pill good">Carta ✓</span>}{' '}
                            {row.emetrixFecha && <span className="pill good">Emetrix ✓</span>}
                            {!row.contratoFecha && !row.imssFecha && !row.cartaFecha && !row.emetrixFecha && '—'}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {row.contratoFecha && (
                          <div>Contrato: {row.contratoFechaParsed ?? `${row.contratoFecha} (sin interpretar)`}</div>
                        )}
                        {row.imssFecha && <div>IMSS: {row.imssFechaParsed ?? `${row.imssFecha} (sin interpretar)`}</div>}
                        {row.cartaFecha && (
                          <div>Carta: {row.cartaFechaParsed ?? `${row.cartaFecha} (sin interpretar)`}</div>
                        )}
                        {row.emetrixFecha && (
                          <div>Emetrix: {row.emetrixFechaParsed ?? `${row.emetrixFecha} (sin interpretar)`}</div>
                        )}
                        {!row.contratoFecha && !row.imssFecha && !row.cartaFecha && !row.emetrixFecha && '—'}
                      </td>
                      {rol === 'mesa_control' && (
                        <td>
                          {row.promotor ? (
                            <span className={`pill ${row.promotor.imss ? 'good' : 'na'}`}>
                              {row.promotor.imss ? `IMSS ✓${row.promotor.fechaImss ? ` (${row.promotor.fechaImss})` : ''}` : 'Pendiente'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {parsed && mapeoValida && promotores && (
        <div className="roster">
          <p className="section-title" style={{ margin: '0 0 14px' }}>
            Paso 5 · Aplicar
          </p>
          <p className="roster-hint">
            Al confirmar, se marca {camposAAplicar.map((c) => CAMPO_LABEL[c]).join(' y ') || 'lo mapeado'} solo en
            los {conMatch.length} promotores con coincidencia de arriba. Los RFC sin coincidencia no se tocan ni
            rompen el proceso — quedan listados al final.
          </p>
          {applyError && <p className="login-error">{applyError}</p>}
          <button
            type="button"
            className="close-month-btn"
            onClick={handleAplicar}
            disabled={applying || conMatch.length === 0}
          >
            {applying ? 'Aplicando…' : `Aplicar cambios a ${conMatch.length} promotor${conMatch.length === 1 ? '' : 'es'}`}
          </button>

          {applyResult && (
            <div className="card" style={{ marginTop: 16, maxWidth: 560 }}>
              <p className="resumen-status import-success" style={{ padding: 0, margin: '0 0 6px' }}>
                {applyResult.actualizados} promotor{applyResult.actualizados === 1 ? '' : 'es'} actualizado
                {applyResult.actualizados === 1 ? '' : 's'}.
              </p>
              {applyResult.sinMatch.length > 0 && (
                <p style={{ margin: 0, fontSize: 13 }}>
                  RFC sin coincidencia ({applyResult.sinMatch.length}):{' '}
                  <span className="mono">{applyResult.sinMatch.join(', ')}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Historial de importaciones
        </p>
        {!history ? (
          <p className="resumen-status">Cargando…</p>
        ) : history.length === 0 ? (
          <p className="roster-hint">Todavía no se ha corrido ninguna importación.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Actualizados</th>
                  <th>Sin coincidencia</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ textAlign: 'left' }}>{formatFechaCorta(h.fecha)}</td>
                    <td>{h.actualizados}</td>
                    <td>{h.noEncontrados}</td>
                    <td>{h.usuarioNombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
