'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCarga, EmetrixKr, EmetrixResultadoCuenta, MarcaConDetalle } from '@/lib/types';
import {
  fetchHistorialEmetrixPonderacion,
  fetchMarcas,
  fetchResultadoEmetrixPonderacion,
  fetchResultadoTodasCuentasEmetrixPonderacion,
  updatePesoEmetrixPonderacion,
} from '@/lib/api-client';
import EmetrixPonderacionZona from './EmetrixPonderacionZona';

const TODAS = '__todas__';

const KR_LABEL: Record<EmetrixKr, string> = {
  mesa_control: 'Mesa de Control',
  materiales: 'Materiales',
  marca: 'Marca',
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmetrixPonderacionAdmin() {
  const [marcas, setMarcas] = useState<MarcaConDetalle[]>([]);
  const [marcaId, setMarcaId] = useState(TODAS);
  const [resultado, setResultado] = useState<EmetrixResultadoCuenta | null>(null);
  const [resumenTodas, setResumenTodas] = useState<EmetrixResultadoCuenta[]>([]);
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
        Mide si los promotores nuevos completan su ciclo de incorporación: si Mesa de Control confirmó un buen primer
        día en tienda, si ya tienen su kit de materiales completo, y si dominan el manejo de marca en anaquel. Es el
        respaldo manual de este cálculo mientras se resuelve la integración automática con Evolve OS — subes el
        Excel de cada sondeo por cuenta y el sistema califica según las reglas de cada KR. Los tres KR (Mesa de
        Control, Materiales, Marca) pesan igual por default (33.3%) hasta tener mediciones calibradas; el resultado
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
                      return <td key={kr}>{k && k.porcentaje !== null ? `${k.porcentaje}%` : 'Sin datos'}</td>;
                    })}
                    <td style={{ fontWeight: 700 }}>{r.total !== null ? `${r.total}%` : 'Sin datos'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <div className="emetrix-zonas-grid">
            <EmetrixPonderacionZona
              kr="mesa_control"
              marcaId={marcaId}
              estado={resultado?.krs.find((k) => k.kr === 'mesa_control')}
              requiereCelular={false}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="materiales"
              marcaId={marcaId}
              estado={resultado?.krs.find((k) => k.kr === 'materiales')}
              requiereCelular={true}
              onGuardado={handleGuardado}
            />
            <EmetrixPonderacionZona
              kr="marca"
              marcaId={marcaId}
              estado={resultado?.krs.find((k) => k.kr === 'marca')}
              requiereCelular={false}
              onGuardado={handleGuardado}
            />
          </div>

          <div className="roster">
            <p className="section-title" style={{ margin: '0 0 14px' }}>
              Resultado por cuenta
            </p>
            {resultado && (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>KR</th>
                    <th>Universo</th>
                    <th>Cumplieron</th>
                    <th>% Cumplimiento</th>
                    <th>Peso</th>
                    <th>Aportación</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.krs.map((k) => (
                    <tr key={k.kr}>
                      <td style={{ textAlign: 'left' }}>{KR_LABEL[k.kr]}</td>
                      <td>
                        {k.universo ?? '—'}
                        {k.universoManual === false && ' *'}
                      </td>
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
                    <td colSpan={4} />
                    <td style={{ fontWeight: 700 }}>{resultado.total !== null ? `${resultado.total}%` : 'Sin datos'}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {resultado && resultado.krs.some((k) => k.universoManual === false) && (
              <p className="roster-hint" style={{ marginTop: 8 }}>
                * universo = solo respondientes del archivo, sin headcount real capturado — el % puede estar
                calculado sobre menos gente de la que en realidad tiene la cuenta.
              </p>
            )}
            {resultado && resultado.krs.some((k) => k.porcentaje === null) && (
              <p className="roster-hint" style={{ marginTop: 8 }}>
                El % del OKR se calcula solo con los KR que ya tienen carga — un KR sin datos no cuenta como 0%.
              </p>
            )}
          </div>
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
                  <td>
                    {h.universo}
                    {!h.universoManual && ' *'}
                  </td>
                  <td>{h.cumplieron}</td>
                  <td>{h.porcentaje}%</td>
                  <td className="emetrix-historial-archivo">{h.archivoNombre || '—'}</td>
                  <td>{h.cargadoPorNombre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="roster-hint" style={{ marginTop: 8 }}>
          * universo = respondientes del archivo, no headcount real capturado.
        </p>
      </div>
    </div>
  );
}
