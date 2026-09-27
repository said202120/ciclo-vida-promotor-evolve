'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCarga, EmetrixEstado, EmetrixKr, EmetrixOkrNodo, EmetrixOkrResultadoCuenta, EmetrixVistaCruzadaFila, MarcaConDetalle } from '@/lib/types';
import {
  emetrixOkrExcelUrl,
  fetchConfigEmetrixPonderacion,
  fetchHistorialEmetrixPonderacion,
  fetchMarcas,
  fetchOkrEmetrixPonderacion,
  fetchOkrTodasCuentasEmetrixPonderacion,
  fetchVistaCruzadaEmetrixPonderacion,
  updateContratoFirmadoManualEmetrixPonderacion,
  updateHeadcountManualEmetrixPonderacion,
  updateImssManualEmetrixPonderacion,
  updateModulosPublicadosManualEmetrixPonderacion,
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

// Los únicos KPI de captura manual del OKR (no salen de ningún sondeo) — sus códigos vienen de lib/emetrix-ponderacion.ts.
const MANUAL_KPI_UPDATERS: Record<string, (marcaId: string, valor: number | null) => Promise<{ ok: true }>> = {
  'KR1.3': updateContratoFirmadoManualEmetrixPonderacion,
  'KR1.4': updateImssManualEmetrixPonderacion,
  'KR3.1': updateModulosPublicadosManualEmetrixPonderacion,
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

type NodoAplanado = { nodo: EmetrixOkrNodo; profundidad: number };

function aplanar(nodo: EmetrixOkrNodo, profundidad = 0): NodoAplanado[] {
  return [{ nodo, profundidad }, ...nodo.hijos.flatMap((h) => aplanar(h, profundidad + 1))];
}

function ArbolOkrTabla({ raiz, onManualKpiChange }: { raiz: EmetrixOkrNodo; onManualKpiChange: (codigo: string, valorNuevo: string) => void }) {
  return (
    <div className="emetrix-detalle-tabla-wrap">
      <table className="roster-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Nombre</th>
            <th>Peso</th>
            <th>% Obtenido</th>
            <th style={{ textAlign: 'left' }}>Fuente</th>
          </tr>
        </thead>
        <tbody>
          {aplanar(raiz).map(({ nodo, profundidad }) => {
            const esManual = nodo.nivel === 'kpi' && nodo.codigo in MANUAL_KPI_UPDATERS;
            return (
              <tr key={nodo.codigo} style={nodo.nivel !== 'kpi' ? { fontWeight: 700 } : undefined}>
                <td style={{ textAlign: 'left', paddingLeft: 12 + profundidad * 20 }}>
                  <span className="roster-hint">{nodo.codigo}</span> {nodo.nombre}
                </td>
                <td>{nodo.peso}%</td>
                <td>
                  {esManual ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      defaultValue={nodo.porcentaje ?? ''}
                      placeholder={nodo.pendienteTexto ?? ''}
                      onBlur={(e) => onManualKpiChange(nodo.codigo, e.target.value)}
                      style={{ width: 64 }}
                    />
                  ) : nodo.porcentaje !== null ? (
                    `${nodo.porcentaje}%`
                  ) : (
                    nodo.pendienteTexto
                  )}
                  {nodo.calculadoNota && <div className="roster-hint">{nodo.calculadoNota}</div>}
                </td>
                <td style={{ textAlign: 'left' }}>{nodo.fuente}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function EmetrixPonderacionAdmin() {
  const [marcas, setMarcas] = useState<MarcaConDetalle[]>([]);
  const [marcaId, setMarcaId] = useState(TODAS);
  const [okr, setOkr] = useState<EmetrixOkrResultadoCuenta | null>(null);
  const [config, setConfig] = useState<{ incluyeCelular: boolean | null; headcountManual: number | null } | null>(null);
  const [okrTodas, setOkrTodas] = useState<EmetrixOkrResultadoCuenta[]>([]);
  const [vistaCruzada, setVistaCruzada] = useState<EmetrixVistaCruzadaFila[]>([]);
  const [historial, setHistorial] = useState<EmetrixCarga[]>([]);
  const [historialMarcaId, setHistorialMarcaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarcas()
      .then(setMarcas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el maestro de marcas.'));
    reloadOkrTodas();
    reloadHistorial('');
  }, []);

  function reloadHistorial(id: string) {
    fetchHistorialEmetrixPonderacion(id || undefined)
      .then(setHistorial)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.'));
  }

  function reloadCuenta(id: string) {
    fetchOkrEmetrixPonderacion(id)
      .then(setOkr)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el árbol OKR.'));
    fetchVistaCruzadaEmetrixPonderacion(id)
      .then(setVistaCruzada)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la vista cruzada.'));
    fetchConfigEmetrixPonderacion(id)
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración de la cuenta.'));
  }

  function reloadOkrTodas() {
    fetchOkrTodasCuentasEmetrixPonderacion()
      .then(setOkrTodas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen de cuentas.'));
  }

  function handleCuentaChange(id: string) {
    setMarcaId(id);
    if (id === TODAS) reloadOkrTodas();
    else reloadCuenta(id);
  }

  function handleGuardado() {
    if (marcaId !== TODAS) reloadCuenta(marcaId);
    reloadOkrTodas();
    reloadHistorial(historialMarcaId);
  }

  function handleUmbralChange(valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const umbral = parseFloat(valorNuevo);
    if (!Number.isFinite(umbral) || umbral < 0 || umbral > 100) return;
    updateUmbralRespuestaEmetrixPonderacion(marcaId, umbral)
      .then(() => reloadCuenta(marcaId))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el umbral de respuesta.'));
  }

  function handleHeadcountChange(valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const headcount = valorNuevo.trim() === '' ? null : parseInt(valorNuevo, 10);
    if (headcount !== null && (!Number.isFinite(headcount) || headcount <= 0)) return;
    updateHeadcountManualEmetrixPonderacion(marcaId, headcount)
      .then(() => reloadCuenta(marcaId))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el headcount de la cuenta.'));
  }

  function handleManualKpiChange(codigo: string, valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const updater = MANUAL_KPI_UPDATERS[codigo];
    if (!updater) return;
    const valor = valorNuevo.trim() === '' ? null : parseFloat(valorNuevo);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 100)) return;
    updater(marcaId, valor)
      .then(() => reloadCuenta(marcaId))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el KPI.'));
  }

  function handleHistorialFiltro(id: string) {
    setHistorialMarcaId(id);
    reloadHistorial(id);
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
        Espejo del OKR oficial "Ciclo de vida del promotor" (el archivo de Carlos conectado a EvolveOS): mismos KR,
        mismos KPI, mismos pesos — OKR = KR1×30% + KR2×40% + KR3×30%. Los KPI de sondeo (Mesa de Control, Materiales,
        Tu Marca) se alimentan de los Excel que subes abajo; los KPI de captura manual (Contrato firmado, Alta ante
        el IMSS, Módulos publicados) se capturan directo en la tabla y quedan "Pendiente" hasta entonces — un KPI
        pendiente nunca cuenta como 0%, el % de su KR se calcula solo con los KPI que sí tienen dato.
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
        <a className="add-row" href={emetrixOkrExcelUrl()} style={{ marginLeft: 'auto' }}>
          ⇩ Descargar para OKR
        </a>
      </div>

      {marcaId === TODAS ? (
        <div className="roster">
          <p className="section-title" style={{ margin: '0 0 14px' }}>
            Resumen de todas las cuentas
          </p>
          {okrTodas.length === 0 ? (
            <p className="resumen-status">Ninguna cuenta tiene cargas todavía.</p>
          ) : (
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>KR1 · Kit administrativo</th>
                  <th>KR2 · Materiales</th>
                  <th>KR3 · Capacitación</th>
                  <th>OKR</th>
                </tr>
              </thead>
              <tbody>
                {okrTodas.map((c) => (
                  <tr key={c.marcaId}>
                    <td style={{ textAlign: 'left' }}>{c.marcaNombre}</td>
                    {['KR1', 'KR2', 'KR3'].map((codigo) => {
                      const k = c.raiz.hijos.find((x) => x.codigo === codigo);
                      return <td key={codigo}>{k && k.porcentaje !== null ? `${k.porcentaje}%` : 'Sin datos'}</td>;
                    })}
                    <td style={{ fontWeight: 700 }}>
                      {c.raiz.porcentaje !== null ? `${c.raiz.porcentaje}%` : 'Sin datos'}
                      {c.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 6 }}>⚠ alerta</span>}
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
              capturado, ese KPI queda "sin universo" y en alerta.
            </p>
          </div>

          <div className="emetrix-zonas-grid">
            <EmetrixPonderacionZona
              kr="mesa_control"
              marcaId={marcaId}
              cargadoEn={okr?.sondeosCargadoEn.mesa_control ?? null}
              requiereCelular={false}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="materiales"
              marcaId={marcaId}
              cargadoEn={okr?.sondeosCargadoEn.materiales ?? null}
              requiereCelular={true}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="marca"
              marcaId={marcaId}
              cargadoEn={okr?.sondeosCargadoEn.marca ?? null}
              requiereCelular={false}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
          </div>

          <div className="roster">
            <div className="roster-head">
              <p className="section-title" style={{ margin: 0 }}>
                OKR — Ciclo de vida del promotor
                {okr?.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 8 }}>⚠ alerta</span>}
              </p>
              {okr && (
                <label className="roster-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Umbral de respuesta mínimo
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={okr.umbralRespuesta}
                    key={`${okr.marcaId}-${okr.umbralRespuesta}`}
                    onBlur={(e) => handleUmbralChange(e.target.value)}
                    style={{ width: 56 }}
                  />
                  %
                </label>
              )}
            </div>
            {okr && <ArbolOkrTabla raiz={okr.raiz} onManualKpiChange={handleManualKpiChange} />}
          </div>

          {vistaCruzada.length > 0 && (
            <div className="roster">
              <p className="section-title" style={{ margin: '0 0 14px' }}>
                Vista cruzada por promotor
              </p>
              <p className="roster-hint" style={{ marginTop: -8, marginBottom: 14 }}>
                Estado de cada promotor del padrón en la carga más reciente de cada sondeo (solo disponible cuando esa
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
