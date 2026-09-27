'use client';

import { useState } from 'react';
import type { EmetrixOkrResultadoCuenta } from '@/lib/types';
import { indicadoresPlanos } from '@/lib/emetrix-ponderacion-calc';
import {
  updateContratoFirmadoManualEmetrixPonderacion,
  updateHeadcountManualEmetrixPonderacion,
  updateImssManualEmetrixPonderacion,
  updateModulosPublicadosManualEmetrixPonderacion,
} from '@/lib/api-client';

type ColumnaManual = { codigo: string; label: string; update: (marcaId: string, periodo: string, valor: number | null) => Promise<{ ok: true }> };

const COLUMNAS_MANUAL: ColumnaManual[] = [
  { codigo: 'KR1.3', label: 'Contrato firmado', update: updateContratoFirmadoManualEmetrixPonderacion },
  { codigo: 'KR1.4', label: 'Alta ante el IMSS', update: updateImssManualEmetrixPonderacion },
  { codigo: 'KR3.1', label: 'Módulos publicados', update: updateModulosPublicadosManualEmetrixPonderacion },
];

/**
 * "Captura rápida del mes" (guía de indicadores de Operaciones): una sola
 * tabla con todas las cuentas y las columnas que se capturan a mano
 * (Contrato firmado / Alta IMSS / Módulos publicados — DE ESTE PERIODO — y
 * Headcount, que no es por periodo), para llenarlas de corrido como en
 * Excel sin entrar cuenta por cuenta. Cada celda guarda al salir del campo
 * (`onBlur`), igual que la tabla del árbol OKR de una sola cuenta.
 */
export default function EmetrixCapturaRapida({
  cuentas,
  periodo,
  onCambio,
}: {
  cuentas: EmetrixOkrResultadoCuenta[];
  periodo: string;
  onCambio: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function handleManualBlur(update: ColumnaManual['update'], marcaId: string, valorNuevo: string) {
    const valor = valorNuevo.trim() === '' ? null : parseFloat(valorNuevo);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 100)) return;
    update(marcaId, periodo, valor)
      .then(onCambio)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo guardar.'));
  }

  function handleHeadcountBlur(marcaId: string, valorNuevo: string) {
    const headcount = valorNuevo.trim() === '' ? null : parseInt(valorNuevo, 10);
    if (headcount !== null && (!Number.isFinite(headcount) || headcount <= 0)) return;
    updateHeadcountManualEmetrixPonderacion(marcaId, headcount)
      .then(onCambio)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo guardar.'));
  }

  if (cuentas.length === 0) {
    return <p className="resumen-status">No hay cuentas registradas.</p>;
  }

  return (
    <>
      {error && <p className="login-error">{error}</p>}
      <div className="emetrix-tabla-scroll">
        <table className="roster-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Cuenta</th>
              {COLUMNAS_MANUAL.map((col) => (
                <th key={col.codigo}>{col.label}</th>
              ))}
              <th>Headcount (no es por periodo)</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => {
              const planos = indicadoresPlanos(c.raiz);
              return (
                <tr key={c.marcaId}>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{c.marcaNombre}</td>
                  {COLUMNAS_MANUAL.map((col) => {
                    const indicador = planos[col.codigo]?.indicador;
                    return (
                      <td key={col.codigo}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          defaultValue={indicador?.valor ?? ''}
                          placeholder="Sin medir"
                          key={`${c.marcaId}-${col.codigo}-${periodo}-${indicador?.valor ?? 'vacio'}`}
                          onBlur={(e) => handleManualBlur(col.update, c.marcaId, e.target.value)}
                          style={{ width: 70 }}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <input
                      type="number"
                      min={1}
                      defaultValue={c.headcountManual ?? ''}
                      placeholder="Sin headcount"
                      key={`${c.marcaId}-headcount-${c.headcountManual ?? 'vacio'}`}
                      onBlur={(e) => handleHeadcountBlur(c.marcaId, e.target.value)}
                      style={{ width: 90 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
