'use client';

import { useEffect, useState } from 'react';
import type { EmetrixCarga, EmetrixKr, EmetrixResultadoCuenta, MarcaConDetalle } from '@/lib/types';
import {
  fetchHistorialEmetrixPonderacion,
  fetchMarcas,
  fetchResultadoEmetrixPonderacion,
  updatePesoEmetrixPonderacion,
} from '@/lib/api-client';
import EmetrixPonderacionZona from './EmetrixPonderacionZona';

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
  const [marcaResultado, setMarcaResultado] = useState('');
  const [resultado, setResultado] = useState<EmetrixResultadoCuenta | null>(null);
  const [historial, setHistorial] = useState<EmetrixCarga[]>([]);
  const [historialMarcaId, setHistorialMarcaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarcas()
      .then(setMarcas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el maestro de marcas.'));
    reloadHistorial('');
  }, []);

  function reloadHistorial(marcaId: string) {
    fetchHistorialEmetrixPonderacion(marcaId || undefined)
      .then(setHistorial)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.'));
  }

  function reloadResultado(marcaId: string) {
    if (!marcaId) {
      setResultado(null);
      return;
    }
    fetchResultadoEmetrixPonderacion(marcaId)
      .then(setResultado)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resultado.'));
  }

  function handleGuardado(marcaId: string) {
    reloadHistorial(historialMarcaId);
    if (marcaId === marcaResultado) reloadResultado(marcaId);
    if (!marcaResultado) {
      setMarcaResultado(marcaId);
      reloadResultado(marcaId);
    }
  }

  function handleMarcaResultado(marcaId: string) {
    setMarcaResultado(marcaId);
    reloadResultado(marcaId);
  }

  function handlePesoChange(kr: EmetrixKr, valorNuevo: string) {
    if (!marcaResultado) return;
    const peso = parseFloat(valorNuevo);
    if (!Number.isFinite(peso) || peso < 0 || peso > 100) return;
    updatePesoEmetrixPonderacion(marcaResultado, kr, peso)
      .then(() => reloadResultado(marcaResultado))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar el peso.'));
  }

  function handleHistorialFiltro(marcaId: string) {
    setHistorialMarcaId(marcaId);
    reloadHistorial(marcaId);
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Plan B — Ponderación de sondeos Emetrix</h1>
        </div>
        <a className="topbar-link" href="/">
          ← Volver al tablero
        </a>
      </header>
      <p className="roster-hint" style={{ marginTop: -8, marginBottom: 20 }}>
        Respaldo manual mientras se resuelve la integración automática con Evolve OS. Sube el Excel de cada sondeo por
        cuenta y calcula el % de cumplimiento de cada KR.
      </p>

      {error && <p className="login-error">{error}</p>}

      <EmetrixPonderacionZona kr="mesa_control" marcas={marcas} requiereCelular={false} onGuardado={handleGuardado} />
      <EmetrixPonderacionZona kr="materiales" marcas={marcas} requiereCelular={true} onGuardado={handleGuardado} />
      <EmetrixPonderacionZona kr="marca" marcas={marcas} requiereCelular={false} onGuardado={handleGuardado} />

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Resultado por cuenta
        </p>
        <label className="emetrix-select-cuenta">
          Cuenta/Marca
          <select value={marcaResultado} onChange={(e) => handleMarcaResultado(e.target.value)}>
            <option value="">Selecciona…</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>

        {resultado && (
          <table className="roster-table" style={{ marginTop: 14 }}>
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
                  <td>{k.universo ?? '—'}</td>
                  <td>{k.cumplieron ?? '—'}</td>
                  <td>{k.porcentaje !== null ? `${k.porcentaje}%` : 'Sin carga'}</td>
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
                <td style={{ fontWeight: 700 }}>{resultado.total}%</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

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
