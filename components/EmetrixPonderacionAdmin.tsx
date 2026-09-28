'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCarga, EmetrixEstado, EmetrixKpiManualBase, EmetrixKr, EmetrixOkrNodo, EmetrixOkrResultadoCuenta, EmetrixVistaCruzadaFila, MarcaConDetalle } from '@/lib/types';
import { formatIndicadorConMeta, formatPeriodoLabel } from '@/lib/emetrix-ponderacion-calc';
import {
  emetrixOkrExcelUrl,
  fetchConfigEmetrixPonderacion,
  fetchHistorialEmetrixPonderacion,
  fetchMarcas,
  fetchOkrEmetrixPonderacion,
  fetchOkrTodasCuentasEmetrixPonderacion,
  fetchPeriodosEmetrixPonderacion,
  fetchVistaCruzadaEmetrixPonderacion,
  updateContratoFirmadoManualEmetrixPonderacion,
  updateHeadcountManualEmetrixPonderacion,
  updateImssManualEmetrixPonderacion,
  updateModulosPublicadosManualEmetrixPonderacion,
  updateUmbralRespuestaEmetrixPonderacion,
} from '@/lib/api-client';
import EmetrixPonderacionZona from './EmetrixPonderacionZona';
import EmetrixComoVaCadaCuenta from './EmetrixComoVaCadaCuenta';
import EmetrixPendientesIndicador from './EmetrixPendientesIndicador';
import EmetrixCapturaRapida from './EmetrixCapturaRapida';
import EmetrixKpiBaseInputs from './EmetrixKpiBaseInputs';

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

// Los únicos KPI de captura manual con base del OKR (no salen de ningún sondeo) — sus códigos vienen de lib/emetrix-ponderacion.ts. Son DE UN PERIODO, igual que los de sondeo.
type ManualKpiConfig = {
  labelNumerador: string;
  labelDenominador: string;
  entrada: (kpiManualBase: EmetrixOkrResultadoCuenta['kpiManualBase']) => EmetrixKpiManualBase;
  update: (marcaId: string, periodo: string, numerador: number | null, denominador: number | null) => Promise<{ ok: true }>;
};

const MANUAL_KPI_CONFIG: Record<string, ManualKpiConfig> = {
  'KR1.3': {
    labelNumerador: 'Firmados antes del ingreso',
    labelDenominador: 'Nuevos ingresos del mes',
    entrada: (k) => k.contratoFirmado,
    update: updateContratoFirmadoManualEmetrixPonderacion,
  },
  'KR1.4': {
    labelNumerador: 'Altas antes del ingreso',
    labelDenominador: 'Nuevos ingresos del mes',
    entrada: (k) => k.imss,
    update: updateImssManualEmetrixPonderacion,
  },
  'KR3.1': {
    labelNumerador: 'Publicados',
    labelDenominador: 'Programados a la fecha',
    entrada: (k) => k.modulosPublicados,
    update: updateModulosPublicadosManualEmetrixPonderacion,
  },
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

type NodoAplanado = { nodo: EmetrixOkrNodo; profundidad: number };

function aplanar(nodo: EmetrixOkrNodo, profundidad = 0): NodoAplanado[] {
  return [{ nodo, profundidad }, ...nodo.hijos.flatMap((h) => aplanar(h, profundidad + 1))];
}

function ArbolOkrTabla({
  raiz,
  kpiManualBase,
  onManualKpiChange,
}: {
  raiz: EmetrixOkrNodo;
  kpiManualBase: EmetrixOkrResultadoCuenta['kpiManualBase'];
  onManualKpiChange: (codigo: string, numerador: number | null, denominador: number | null) => void;
}) {
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
            const config = nodo.nivel === 'kpi' ? MANUAL_KPI_CONFIG[nodo.codigo] : undefined;
            const { indicador } = nodo;
            return (
              <tr key={nodo.codigo} style={nodo.nivel !== 'kpi' ? { fontWeight: 700 } : undefined}>
                <td style={{ textAlign: 'left', paddingLeft: 12 + profundidad * 20 }}>
                  <span className="roster-hint">{nodo.codigo}</span> {nodo.nombre}
                  {nodo.nivel === 'kpi' && <div className="roster-hint emetrix-nombre-oficial">{nodo.nombreOficial}</div>}
                </td>
                <td>{nodo.peso}%</td>
                <td>
                  {config ? (
                    <>
                      <EmetrixKpiBaseInputs
                        entrada={config.entrada(kpiManualBase)}
                        labelNumerador={config.labelNumerador}
                        labelDenominador={config.labelDenominador}
                        onGuardar={(numerador, denominador) => onManualKpiChange(nodo.codigo, numerador, denominador)}
                      />
                      {nodo.meta !== null && <div className="roster-hint">Meta: {nodo.meta}%</div>}
                    </>
                  ) : (
                    formatIndicadorConMeta(indicador, nodo.meta)
                  )}
                  <div className="roster-hint">{indicador.motivo}</div>
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
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState('');
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
    fetchPeriodosEmetrixPonderacion()
      .then((res) => {
        setPeriodos(res.periodos);
        setPeriodo(res.actual);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de periodos.'));
  }, []);

  // Al cambiar de periodo (o al obtenerlo por primera vez): recarga todo lo que se ve en pantalla para ese mes — nunca se mezclan periodos.
  useEffect(() => {
    if (!periodo) return;
    if (marcaId === TODAS) reloadOkrTodas(periodo);
    else reloadCuenta(marcaId, periodo);
    reloadHistorial(historialMarcaId, periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  function reloadHistorial(id: string, periodoConsulta: string) {
    fetchHistorialEmetrixPonderacion(periodoConsulta, id || undefined)
      .then(setHistorial)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.'));
  }

  function reloadCuenta(id: string, periodoConsulta: string) {
    fetchOkrEmetrixPonderacion(id, periodoConsulta)
      .then(setOkr)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el árbol OKR.'));
    fetchVistaCruzadaEmetrixPonderacion(id, periodoConsulta)
      .then(setVistaCruzada)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la vista cruzada.'));
    fetchConfigEmetrixPonderacion(id)
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración de la cuenta.'));
  }

  function reloadOkrTodas(periodoConsulta: string) {
    fetchOkrTodasCuentasEmetrixPonderacion(periodoConsulta)
      .then(setOkrTodas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen de cuentas.'));
  }

  function handlePeriodoChange(nuevo: string) {
    setPeriodo(nuevo);
  }

  function handleCuentaChange(id: string) {
    setMarcaId(id);
    if (id === TODAS) reloadOkrTodas(periodo);
    else reloadCuenta(id, periodo);
  }

  function handleGuardado() {
    if (marcaId !== TODAS) reloadCuenta(marcaId, periodo);
    reloadOkrTodas(periodo);
    reloadHistorial(historialMarcaId, periodo);
  }

  function handleUmbralChange(valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const umbral = parseFloat(valorNuevo);
    if (!Number.isFinite(umbral) || umbral < 0 || umbral > 100) return;
    updateUmbralRespuestaEmetrixPonderacion(marcaId, umbral)
      .then(() => reloadCuenta(marcaId, periodo))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el umbral de respuesta.'));
  }

  function handleHeadcountChange(valorNuevo: string) {
    if (!marcaId || marcaId === TODAS) return;
    const headcount = valorNuevo.trim() === '' ? null : parseInt(valorNuevo, 10);
    if (headcount !== null && (!Number.isFinite(headcount) || headcount <= 0)) return;
    updateHeadcountManualEmetrixPonderacion(marcaId, headcount)
      .then(() => reloadCuenta(marcaId, periodo))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el headcount de la cuenta.'));
  }

  function handleManualKpiChange(codigo: string, numerador: number | null, denominador: number | null) {
    if (!marcaId || marcaId === TODAS) return;
    const config = MANUAL_KPI_CONFIG[codigo];
    if (!config) return;
    config
      .update(marcaId, periodo, numerador, denominador)
      .then(() => reloadCuenta(marcaId, periodo))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el KPI.'));
  }

  function handleCapturaRapidaCambio() {
    if (marcaId !== TODAS) reloadCuenta(marcaId, periodo);
    reloadOkrTodas(periodo);
  }

  function handleHistorialFiltro(id: string) {
    setHistorialMarcaId(id);
    reloadHistorial(id, periodo);
  }

  return (
    <div className="wrap emetrix-tema">
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
        el IMSS, Módulos publicados) se capturan directo en la tabla, MES CON MES igual que los de sondeo, y quedan
        "Sin medir" hasta entonces — un indicador sin medir nunca cuenta como 0%, el % de su KR se calcula solo con
        los que sí tienen dato.
      </p>

      {error && <p className="login-error">{error}</p>}

      <div className="month-bar emetrix-cuenta-bar">
        <span className="emetrix-cuenta-label">Periodo</span>
        <select value={periodo} onChange={(e) => handlePeriodoChange(e.target.value)}>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {formatPeriodoLabel(p)}
            </option>
          ))}
        </select>
        <span className="emetrix-cuenta-label">Cuenta</span>
        <select value={marcaId} onChange={(e) => handleCuentaChange(e.target.value)}>
          <option value={TODAS}>Todas las cuentas</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <a className="add-row" href={emetrixOkrExcelUrl(periodo)} style={{ marginLeft: 'auto' }}>
          ⇩ Descargar para OKR
        </a>
      </div>
      <p className="roster-hint" style={{ marginTop: -6, marginBottom: 14 }}>
        Toda la pantalla y la descarga muestran solo el periodo seleccionado — nunca se mezclan cargas de meses
        distintos en un mismo cálculo. Los 3 KPI de captura manual (Contrato firmado, IMSS, Módulos publicados)
        también son de este periodo: hay que capturarlos cada mes, igual que se sube cada sondeo (el headcount de la
        cuenta es la única excepción — ese sí aplica igual sin importar el mes).
      </p>

      {!periodo ? null : marcaId === TODAS ? (
        <>
          <div className="roster">
            <p className="section-title" style={{ margin: '0 0 4px' }}>
              Cómo va cada cuenta · {formatPeriodoLabel(periodo)}
            </p>
            <p className="roster-hint" style={{ marginTop: 0, marginBottom: 14 }}>
              Verde ≥90%, amarillo ≥70%, rojo abajo de 70% — "Sin medir" (gris, borde punteado) es un hueco, no un
              incumplimiento.
            </p>
            <EmetrixComoVaCadaCuenta cuentas={okrTodas} />
          </div>

          <div className="roster">
            <p className="section-title" style={{ margin: '0 0 14px' }}>
              Pendientes de indicador
            </p>
            <EmetrixPendientesIndicador cuentas={okrTodas} />
          </div>

          <div className="roster">
            <p className="section-title" style={{ margin: '0 0 4px' }}>
              Captura rápida del mes · {formatPeriodoLabel(periodo)}
            </p>
            <p className="roster-hint" style={{ marginTop: 0, marginBottom: 14 }}>
              Contrato firmado, Alta IMSS y Módulos publicados son de este periodo; el headcount no.
            </p>
            <EmetrixCapturaRapida cuentas={okrTodas} periodo={periodo} onCambio={handleCapturaRapidaCambio} />
          </div>
        </>
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
              periodo={periodo}
              cargadoEn={okr?.sondeosCargadoEn.mesa_control ?? null}
              requiereCelular={false}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="materiales"
              marcaId={marcaId}
              periodo={periodo}
              cargadoEn={okr?.sondeosCargadoEn.materiales ?? null}
              requiereCelular={true}
              incluyeCelularGuardado={config?.incluyeCelular ?? null}
              headcountCuenta={config?.headcountManual ?? null}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="marca"
              marcaId={marcaId}
              periodo={periodo}
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
                OKR — Ciclo de vida del promotor · {formatPeriodoLabel(periodo)}
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
            {okr && <ArbolOkrTabla raiz={okr.raiz} kpiManualBase={okr.kpiManualBase} onManualKpiChange={handleManualKpiChange} />}
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
          <div className="emetrix-tabla-scroll">
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
          </div>
        )}
      </div>
    </div>
  );
}
