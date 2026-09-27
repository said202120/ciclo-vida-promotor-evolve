'use client';

import { useState } from 'react';
import type { EmetrixKpiManualBase, EmetrixOkrResultadoCuenta } from '@/lib/types';
import {
  updateContratoFirmadoManualEmetrixPonderacion,
  updateHeadcountManualEmetrixPonderacion,
  updateImssManualEmetrixPonderacion,
  updateModulosPublicadosManualEmetrixPonderacion,
} from '@/lib/api-client';
import EmetrixKpiBaseInputs from './EmetrixKpiBaseInputs';

type ColumnaManual = {
  codigo: string;
  label: string;
  labelNumerador: string;
  labelDenominador: string;
  entrada: (cuenta: EmetrixOkrResultadoCuenta) => EmetrixKpiManualBase;
  update: (marcaId: string, periodo: string, numerador: number | null, denominador: number | null) => Promise<{ ok: true }>;
};

const COLUMNAS_MANUAL: ColumnaManual[] = [
  {
    codigo: 'KR1.3',
    label: 'Contrato firmado',
    labelNumerador: 'Firmados antes del ingreso',
    labelDenominador: 'Nuevos ingresos del mes',
    entrada: (c) => c.kpiManualBase.contratoFirmado,
    update: updateContratoFirmadoManualEmetrixPonderacion,
  },
  {
    codigo: 'KR1.4',
    label: 'Alta ante el IMSS',
    labelNumerador: 'Altas antes del ingreso',
    labelDenominador: 'Nuevos ingresos del mes',
    entrada: (c) => c.kpiManualBase.imss,
    update: updateImssManualEmetrixPonderacion,
  },
  {
    codigo: 'KR3.1',
    label: 'Módulos publicados',
    labelNumerador: 'Publicados',
    labelDenominador: 'Programados a la fecha',
    entrada: (c) => c.kpiManualBase.modulosPublicados,
    update: updateModulosPublicadosManualEmetrixPonderacion,
  },
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

  function handleManualGuardar(update: ColumnaManual['update'], marcaId: string, numerador: number | null, denominador: number | null) {
    update(marcaId, periodo, numerador, denominador)
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
                <th key={col.codigo} className="emetrix-captura-rapida-col">
                  {col.label}
                </th>
              ))}
              <th>Headcount (no es por periodo)</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => {
              return (
                <tr key={c.marcaId}>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{c.marcaNombre}</td>
                  {COLUMNAS_MANUAL.map((col) => {
                    const entrada = col.entrada(c);
                    return (
                      <td key={col.codigo}>
                        <EmetrixKpiBaseInputs
                          key={`${c.marcaId}-${col.codigo}-${periodo}-${entrada.numerador ?? 'v'}-${entrada.denominador ?? 'v'}`}
                          entrada={entrada}
                          labelNumerador={col.labelNumerador}
                          labelDenominador={col.labelDenominador}
                          anchoInput={80}
                          onGuardar={(numerador, denominador) => handleManualGuardar(col.update, c.marcaId, numerador, denominador)}
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
