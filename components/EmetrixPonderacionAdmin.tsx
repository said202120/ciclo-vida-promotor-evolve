'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCarga, EmetrixEstado, EmetrixKr, EmetrixResultadoCuenta, EmetrixResumenOkr, EmetrixVistaCruzadaFila, MarcaConDetalle } from '@/lib/types';
import {
  emetrixResumenOkrExcelUrl,
  fetchConfigEmetrixPonderacion,
  fetchHistorialEmetrixPonderacion,
  fetchMarcas,
  fetchResultadoEmetrixPonderacion,
  fetchResultadoTodasCuentasEmetrixPonderacion,
  fetchResumenOkrEmetrixPonderacion,
  fetchVistaCruzadaEmetrixPonderacion,
  updateHeadcountManualEmetrixPonderacion,
  updatePesoEmetrixPonderacion,
  updateUmbralRespuestaEmetrixPonderacion,
} from '@/lib/api-client';
import EmetrixPonderacionZona from './EmetrixPonderacionZona';

const TODAS = '__todas__';

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
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmetrixPonderacionAdmin() {
  const [marcas, setMarcas] = useState<MarcaConDetalle[]>([]);
  const [marcaId, setMarcaId] = useState(TODAS);
  const [resultado, setResultado] = useState<EmetrixResultadoCuenta | null>(null);
  const [config, setConfig] = useState<{ incluyeCelular: boolean | null; umbralRespuesta: number; headcountManual: number | null } | null>(null);
  const [resumenOkr, setResumenOkr] = useState<EmetrixResumenOkr | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [resumenTodas, setResumenTodas] = useState<EmetrixResultadoCuenta[]>([]);
  const [vistaCruzada, setVistaCruzada] = useState<EmetrixVistaCruzadaFila[]>([]);
  const [historial, setHistorial] = useState<EmetrixCarga[]>([]);
  const [historialMarcaId, setHistorialMarcaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarcas()
      .then(setMarcas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el maestro de marcas.'));
    reloadResumenTodas();
    reloadHistorial('');
  }, []);

  function reloadHistorial(id: string) {
    fetchHistorialEmetrixPonderacion(id || undefined)
      .then(setHistorial)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.'));
  }

  function reloadResultado(id: string) {
    fetchResultadoEmetrixPonderacion(id)
      .then(setResultado)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resultado.'));
    fetchVistaCruzadaEmetrixPonderacion(id)
      .then(setVistaCruzada)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la vista cruzada.'));
    fetchConfigEmetrixPonderacion(id)
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración de la cuenta.'));
    fetchResumenOkrEmetrixPonderacion(id)
      .then(setResumenOkr)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen para OKR.'));
  }

  function reloadResumenTodas() {
    fetchResultadoTodasCuentasEmetrixPonderacion()
      .then(setResumenTodas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen de cuentas.'));
  }

  function handleCuentaChange(id: string) {
    setMarcaId(id);
    if (id === TODAS) reloadResumenTodas();
    else reloadResultado(id);
  }

  function handleGuardado() {
    if (marcaId !== TODAS) reloadResultado(marcaId);
    reloadResumenTodas();
    reloadHistorial(historialMarcaId);
  }

  function handlePesoChange(kr: EmetrixKr, valorNuevo: string) {
    if (!marcaId) return;
    const peso = parseFloat(valorNuevo);
    if (!Number.isFinite(peso) || peso < 0 || peso > 100) return;
    updatePesoEmetrixPonderacion(marcaId, kr, peso)
      .then(() => reloadResultado(marcaId))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el peso.'));
  }

  function handleUmbralChange(valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const umbral = parseFloat(valorNuevo);
    if (!Number.isFinite(umbral) || umbral < 0 || umbral > 100) return;
    updateUmbralRespuestaEmetrixPonderacion(marcaId, umbral)
      .then(() => reloadResultado(marcaId))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el umbral de respuesta.'));
  }

  function handleHeadcountChange(valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const headcount = valorNuevo.trim() === '' ? null : parseInt(valorNuevo, 10);
    if (headcount !== null && (!Number.isFinite(headcount) || headcount <= 0)) return;
    updateHeadcountManualEmetrixPonderacion(marcaId, headcount)
      .then(() => reloadResultado(marcaId))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el headcount de la cuenta.'));
  }

  function handleHistorialFiltro(id: string) {
    setHistorialMarcaId(id);
    reloadHistorial(id);
  }

  function handleCopiarResumenOkr() {
    if (!resumenOkr) return;
    const texto = resumenOkr.filas.map((f) => `${f.etiqueta}: ${f.valor}`).join('\n');
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo copiar el resumen.'));
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Ciclo de vida del promotor — Ponderación de cumplimiento</h1>
        </div>
        <a className="topbar-link" href="/">
          ← Volver al tablero
        </a>
      </header>
      <p className="roster-hint" style={{ marginTop: -8, marginBottom: 20, maxWidth: 720 }}>
        Mide si los promotores nuevos completan su ciclo de incorporación: si Mesa de Control confirmó un buen primer
        día en tienda, si ya tienen su kit de materiales completo, y si dominan el manejo de marca en anaquel. Es el
        respaldo manual de este cálculo mientras se resuelve la integración automática con Evolve OS — subes el
        Excel de cada sondeo por cuenta y el sistema califica según las reglas de cada KR, usando como universo el
        headcount de la cuenta (uno solo, aplica a los 3 KR). Si a la cuenta le falta capturar el headcount, o si el
        % de respuesta del sondeo queda muy bajo, ese KR se marca en alerta — el resultado no es representativo. Por
        default (propuesta "Habilitación"), Mesa de Control pesa 30%, Materiales 40% y Tu Marca 30%; el resultado
        ponderado es el % del OKR de esa cuenta.
      </p>

      {error && <p className="login-error">{error}</p>}

      <div className="month-bar emetrix-cuenta-bar">
        <span className="emetrix-cuenta-label">Cuenta</span>
        <select value={marcaId} onChange={(e) => handleCuentaChange(e.target.value)}>
          <option value={TODAS}>Todas las cuentas</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      {marcaId === TODAS ? (
        <div className="roster">
          <p className="section-title" style={{ margin: '0 0 14px' }}>
            Resumen de todas las cuentas
          </p>
          {resumenTodas.length === 0 ? (
            <p className="resumen-status">Ninguna cuenta tiene cargas todavía.</p>
          ) : (
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Mesa de Control</th>
                  <th>Materiales</th>
                  <th>Marca</th>
                  <th>Total OKR</th>
                </tr>
              </thead>
              <tbody>
                {resumenTodas.map((r) => (
                  <tr key={r.marcaId}>
                    <td style={{ textAlign: 'left' }}>{r.marcaNombre}</td>
                    {(['mesa_control', 'materiales', 'marca'] as EmetrixKr[]).map((kr) => {
                      const k = r.krs.find((x) => x.kr === kr);
                      return (
                        <td key={kr}>
                          {k && k.porcentaje !== null ? `${k.porcentaje}%` : 'Sin datos'}
                          {k?.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 6 }}>⚠</span>}
                        </td>
                      );
                    })}
                    <td style={{ fontWeight: 700 }}>
                      {r.total !== null ? `${r.total}%` : 'Sin datos'}
                      {r.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 6 }}>⚠ alerta</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <div className="roster emetrix-headcount-cuenta">
            <label className="roster-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Headcount de la cuenta (uno solo, aplica a los 3 sondeos)
              <input
                type="number"
                min={1}
                placeholder="Sin headcount"
                defaultValue={config?.headcountManual ?? ''}
                key={`${marcaId}-${config?.headcountManual ?? 'vacio'}`}
                onBlur={(e) => handleHeadcountChange(e.target.value)}
                style={{ width: 90 }}
              />
            </label>
            <p className="roster-hint" style={{ margin: '6px 0 0' }}>
              Puedes ajustar el universo solo para un sondeo puntual al subirlo. Si esta cuenta no tiene headcount
              capturado, ese KR queda "sin universo" y en alerta.
            </p>
          </div>

          <div className="emetrix-zonas-grid">
            <EmetrixPonderacionZona
              kr="mesa_control"
              marcaId={marcaId}
              estado={resultado?.krs.find((k) => k.kr === 'mesa_control')}
              requiereCelular={false}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="materiales"
              marcaId={marcaId}
              estado={resultado?.krs.find((k) => k.kr === 'materiales')}
              requiereCelular={true}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="marca"
              marcaId={marcaId}
              estado={resultado?.krs.find((k) => k.kr === 'marca')}
              requiereCelular={false}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
          </div>

          <div className="roster">
            <div className="roster-head">
              <p className="section-title" style={{ margin: 0 }}>
                Resultado por cuenta
                {resultado?.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 8 }}>⚠ alerta</span>}
              </p>
              {resultado && (
                <label className="roster-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Umbral de respuesta mínimo
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={resultado.umbralRespuesta}
                    key={`${resultado.marcaId}-${resultado.umbralRespuesta}`}
                    onBlur={(e) => handleUmbralChange(e.target.value)}
                    style={{ width: 56 }}
                  />
                  %
                </label>
              )}
            </div>
            {resultado && (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>KR</th>
                    <th>Universo</th>
                    <th>Contestaron</th>
                    <th>% Respuesta</th>
                    <th>Cumplieron</th>
                    <th>% Cumplimiento</th>
                    <th>Peso</th>
                    <th>Aportación</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.krs.map((k) => (
                    <tr key={k.kr}>
                      <td style={{ textAlign: 'left' }}>
                        {KR_LABEL[k.kr]}
                        {k.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 6 }}>⚠</span>}
                      </td>
                      <td>{k.universoFuente === 'sin_universo' ? 'sin definir' : (k.universo ?? '—')}</td>
                      <td>{k.respondieron ?? '—'}</td>
                      <td>{k.universoFuente === 'sin_universo' ? 'sin universo' : k.porcentajeRespuesta !== null ? `${k.porcentajeRespuesta}%` : '—'}</td>
                      <td>{k.cumplieron ?? '—'}</td>
                      <td>{k.porcentaje !== null ? `${k.porcentaje}%` : 'Sin datos'}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          defaultValue={k.peso}
                          onBlur={(e) => handlePesoChange(k.kr, e.target.value)}
                          style={{ width: 64 }}
                        />
                        %
                      </td>
                      <td>{k.aportacion}%</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>Total</td>
                    <td colSpan={6} />
                    <td style={{ fontWeight: 700 }}>{resultado.total !== null ? `${resultado.total}%` : 'Sin datos'}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {resultado && (
              <p className="roster-hint" style={{ marginTop: 8 }}>
                Ponderación: {resultado.krs.map((k) => `${KR_LABEL[k.kr]} ${k.peso}%`).join(' · ')}
              </p>
            )}
            {resultado && resultado.krs.some((k) => k.universoFuente === 'sin_universo') && (
              <p className="roster-hint" style={{ marginTop: 8 }}>
                ⚠ Falta capturar el headcount de esta cuenta — ese KR queda en alerta, resultado no representativo.
              </p>
            )}
            {resultado && resultado.krs.some((k) => k.enAlerta && k.universoFuente !== 'sin_universo') && (
              <p className="roster-hint" style={{ marginTop: 8 }}>
                ⚠ Respuesta insuficiente, resultado no representativo — el % de respuesta de ese KR está por debajo
                del umbral configurado.
              </p>
            )}
            {resultado && resultado.krs.some((k) => k.porcentaje === null) && (
              <p className="roster-hint" style={{ marginTop: 8 }}>
                Falta cargar: {resultado.krs.filter((k) => k.porcentaje === null).map((k) => KR_LABEL[k.kr]).join(', ')} — el % del OKR se calcula solo
                con los KR que ya tienen carga (usando el % de cumplimiento entre quienes contestaron), repartiendo el
                peso entre los que sí tienen datos.
              </p>
            )}
          </div>

          <div className="roster">
            <div className="roster-head">
              <p className="section-title" style={{ margin: 0 }}>
                Resumen para OKR
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="add-row" onClick={handleCopiarResumenOkr} disabled={!resumenOkr}>
                  {copiado ? '✓ Copiado' : 'Copiar'}
                </button>
                <a className="add-row" href={emetrixResumenOkrExcelUrl(marcaId)}>
                  ⇩ Descargar en Excel
                </a>
              </div>
            </div>
            <p className="roster-hint" style={{ marginTop: -8, marginBottom: 14 }}>
              Traduce estos 3 sondeos a las métricas del OKR oficial "Ciclo de vida del promotor". Contrato e IMSS no
              sale de este sondeo — se confirma aparte con Legal / Nómina.
            </p>
            {resumenOkr && (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>KR del OKR</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenOkr.filas.map((f) => (
                    <tr key={f.etiqueta}>
                      <td style={{ textAlign: 'left' }}>{f.etiqueta}</td>
                      <td>{f.valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {vistaCruzada.length > 0 && (
            <div className="roster">
              <p className="section-title" style={{ margin: '0 0 14px' }}>
                Vista cruzada por promotor
              </p>
              <p className="roster-hint" style={{ marginTop: -8, marginBottom: 14 }}>
                Estado de cada promotor del padrón en la carga más reciente de cada KR (solo disponible cuando esa
                carga usó el padrón como universo).
              </p>
              <div className="emetrix-detalle-tabla-wrap">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>Promotor</th>
                      <th>Mesa de Control</th>
                      <th>Materiales</th>
                      <th>Tu Marca</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vistaCruzada.map((f) => (
                      <tr key={f.promotorId}>
                        <td style={{ textAlign: 'left' }}>{f.nombre}</td>
                        <td>{f.mesaControl ? ESTADO_LABEL[f.mesaControl] : '—'}</td>
                        <td>{f.materiales ? ESTADO_LABEL[f.materiales] : '—'}</td>
                        <td>{f.marca ? ESTADO_LABEL[f.marca] : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="roster">
        <div className="roster-head">
          <p className="section-title" style={{ margin: 0 }}>
            Historial de cargas
          </p>
          <select value={historialMarcaId} onChange={(e) => handleHistorialFiltro(e.target.value)}>
            <option value="">Todas las cuentas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        {historial.length === 0 ? (
          <p className="resumen-status">Sin cargas todavía.</p>
        ) : (
          <table className="roster-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>KR</th>
                <th>Universo</th>
                <th>Cumplieron</th>
                <th>%</th>
                <th>Filas leídas / descartadas</th>
                <th>Archivo</th>
                <th>Subido por</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td>{formatFecha(h.cargadoEn)}</td>
                  <td style={{ textAlign: 'left' }}>{h.marcaNombre}</td>
                  <td>{KR_LABEL[h.kr]}</td>
                  <td>{h.universoFuente === 'sin_universo' ? 'sin definir' : h.universo}</td>
                  <td>{h.cumplieron}</td>
                  <td>{h.porcentaje}%</td>
                  <td>
                    {h.diagnostico.filasLeidas} / {h.diagnostico.filasSinUsuario + h.diagnostico.filasDuplicadas}
                  </td>
                  <td className="emetrix-historial-archivo">{h.archivoNombre || '—'}</td>
                  <td>{h.cargadoPorNombre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
