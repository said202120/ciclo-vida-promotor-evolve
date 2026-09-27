'use client';

import type { EmetrixOkrResultadoCuenta } from '@/lib/types';
import { calcularPendientes } from '@/lib/emetrix-ponderacion-calc';

/**
 * "Pendientes de indicador" (guía de indicadores de Operaciones): qué falta
 * para que cada hueco deje de serlo, en tres agrupaciones — por dato y
 * responsable ("Falta Contrato firmado: 3 cuentas · Legal"), por cuenta
 * ("Zuru: faltan los 3 sondeos") y headcount faltante (dato de cuenta, no de
 * periodo). Todo el cálculo vive en `calcularPendientes` (pura, con sus
 * propias pruebas) — este componente solo pinta el resultado.
 */
export default function EmetrixPendientesIndicador({ cuentas }: { cuentas: EmetrixOkrResultadoCuenta[] }) {
  const pendientes = calcularPendientes(cuentas);
  const sinPendientes = pendientes.porDato.length === 0 && pendientes.porCuenta.length === 0 && pendientes.headcountFaltante.length === 0;

  if (sinPendientes) {
    return <p className="emetrix-pendientes-vacio">✓ Ningún hueco pendiente este periodo.</p>;
  }

  return (
    <div className="emetrix-pendientes-grid">
      <div>
        <p className="roster-hint" style={{ fontWeight: 600, marginBottom: 8 }}>
          Por dato y responsable
        </p>
        {pendientes.porDato.length === 0 ? (
          <p className="resumen-status">Sin huecos por dato.</p>
        ) : (
          <ul className="emetrix-pendientes-lista">
            {pendientes.porDato.map((d) => (
              <li key={d.codigo}>
                Falta {d.nombre}: {d.cuentas.length} {d.cuentas.length === 1 ? 'cuenta' : 'cuentas'} · {d.owner}
                <div className="emetrix-indicador-motivo" style={{ maxWidth: 'none' }}>
                  {d.cuentas.join(', ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="roster-hint" style={{ fontWeight: 600, marginBottom: 8 }}>
          Por cuenta
        </p>
        {pendientes.porCuenta.length === 0 ? (
          <p className="resumen-status">Sin huecos por cuenta.</p>
        ) : (
          <ul className="emetrix-pendientes-lista">
            {pendientes.porCuenta.map((c) => {
              const partes: string[] = [];
              if (c.sondeosFaltantes.length === 3) partes.push('faltan los 3 sondeos');
              else if (c.sondeosFaltantes.length > 0) partes.push(`falta${c.sondeosFaltantes.length > 1 ? 'n' : ''} ${c.sondeosFaltantes.join(', ')}`);
              if (c.kpisManualesFaltantes.length > 0) partes.push(`falta${c.kpisManualesFaltantes.length > 1 ? 'n' : ''} ${c.kpisManualesFaltantes.join(', ')}`);
              if (c.headcountFaltante) partes.push('sin headcount');
              return (
                <li key={c.marcaId}>
                  <strong>{c.marcaNombre}:</strong> {partes.join(' · ')}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="roster-hint" style={{ fontWeight: 600, marginBottom: 8 }}>
          Headcount faltante
        </p>
        {pendientes.headcountFaltante.length === 0 ? (
          <p className="resumen-status">Todas las cuentas tienen headcount capturado.</p>
        ) : (
          <ul className="emetrix-pendientes-lista">
            {pendientes.headcountFaltante.map((nombre) => (
              <li key={nombre}>{nombre}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
