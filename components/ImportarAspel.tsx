'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImportCampo, ImportMapeo, ImportParseResult } from '@/lib/types';
import { fetchImportConfig, parseImportFile, saveImportConfig } from '@/lib/api-client';

const PREVIEW_ROWS = 5;

const CAMPO_LABEL: Record<ImportCampo, string> = {
  rfc: 'RFC',
  contratoFecha: 'Fecha de contrato firmado',
  imssFecha: 'Fecha de alta IMSS',
  ignorar: 'Ignorar esta columna',
};

const CAMPO_OPTIONS: ImportCampo[] = ['rfc', 'contratoFecha', 'imssFecha', 'ignorar'];

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (diacriticos combinados tras normalize('NFD'))
    .toLowerCase()
    .trim();
}

/** Adivina el campo por el nombre del encabezado cuando no hay un mapeo guardado para esa columna. */
function detectCampoByName(header: string, yaAsignados: Set<ImportCampo>): ImportCampo {
  const norm = normalizeHeader(header);
  if (!yaAsignados.has('rfc') && /\brfc\b/.test(norm)) return 'rfc';
  if (!yaAsignados.has('contratoFecha') && norm.includes('contrato')) return 'contratoFecha';
  if (!yaAsignados.has('imssFecha') && norm.includes('imss')) return 'imssFecha';
  return 'ignorar';
}

/** Mapeo guardado primero (columna por columna); lo que falte se adivina por nombre; el resto queda en "ignorar". */
function proposeMapeo(headers: string[], savedConfig: ImportMapeo | null): ImportMapeo {
  const proposed: ImportMapeo = {};
  const yaAsignados = new Set<ImportCampo>();
  const pendientes: string[] = [];

  for (const h of headers) {
    const saved = savedConfig?.[h];
    if (saved) {
      proposed[h] = saved;
      if (saved !== 'ignorar') yaAsignados.add(saved);
    } else {
      pendientes.push(h);
    }
  }
  for (const h of pendientes) {
    const campo = detectCampoByName(h, yaAsignados);
    proposed[h] = campo;
    if (campo !== 'ignorar') yaAsignados.add(campo);
  }
  return proposed;
}

function validateMapeo(mapeo: ImportMapeo): string | null {
  const values = Object.values(mapeo);
  if (values.filter((c) => c === 'rfc').length !== 1) {
    return 'Asigna una columna a RFC.';
  }
  if (values.filter((c) => c === 'contratoFecha').length > 1) {
    return 'Solo una columna puede ser "Fecha de contrato firmado".';
  }
  if (values.filter((c) => c === 'imssFecha').length > 1) {
    return 'Solo una columna puede ser "Fecha de alta IMSS".';
  }
  if (!values.some((c) => c === 'contratoFecha' || c === 'imssFecha')) {
    return 'Asigna al menos una columna a fecha de contrato o fecha de alta IMSS.';
  }
  return null;
}

export default function ImportarAspel() {
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [savedConfig, setSavedConfig] = useState<ImportMapeo | null>(null);
  const [mapeo, setMapeo] = useState<ImportMapeo>({});
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);

  useEffect(() => {
    fetchImportConfig()
      .then(setSavedConfig)
      .catch(() => setSavedConfig({}));
  }, []);

  useEffect(() => {
    if (!parsed) return;
    setMapeo(proposeMapeo(parsed.headers, savedConfig));
    setMappingSaved(false);
    setMappingError(null);
    // Solo se recalcula al parsear un archivo nuevo, no en cada cambio manual del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

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
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleMapeoChange(header: string, campo: ImportCampo) {
    setMapeo((prev) => ({ ...prev, [header]: campo }));
    setMappingSaved(false);
    setMappingError(null);
  }

  async function handleSaveMapeo() {
    const validationError = validateMapeo(mapeo);
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

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Importar actualización de Aspel</h1>
        </div>
        <a className="topbar-link" href="/">
          ← Volver al tablero
        </a>
      </header>

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
                        {CAMPO_OPTIONS.map((c) => (
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
    </div>
  );
}
