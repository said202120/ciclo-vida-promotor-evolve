'use client';

import type { EmetrixIndicador, EmetrixOkrResultadoCuenta } from '@/lib/types';
import { KPI_CODIGOS_HOJA, indicadoresPlanos, pillEstado } from '@/lib/emetrix-ponderacion-calc';

// Encabezado corto por columna (el nombre completo del KPI va en la
// descripción del árbol OKR; aquí conviene compacto porque son 8 columnas).
const HEADER_CORTO: Record<string, string> = {
  'KR1.1': 'Carta de acceso',
  'KR1.2': 'Usuario Emetrix',
  'KR1.3': 'Contrato',
  'KR1.4': 'Alta IMSS',
  'KR2.1': 'Materiales',
  'KR3.1': 'Módulos publicados',
  'KR3.2': 'Módulo completado',
};

function CeldaIndicador({ indicador }: { indicador: EmetrixIndicador }) {
  const color = pillEstado(indicador);
  return (
    <div className="emetrix-indicador-celda">
      <span className={`pill ${color}`}>{indicador.estado === 'medido' ? `${indicador.valor}%` : 'Sin medir'}</span>
      <span className="emetrix-indicador-motivo">{indicador.motivo}</span>
    </div>
  );
}

/**
 * "Cómo va cada cuenta" (guía de indicadores de Operaciones): un renglón por
 * cuenta, una columna por indicador hoja del árbol OKR (Carta de acceso,
 * Usuario Emetrix, Contrato, Alta IMSS, Materiales, Módulos publicados,
 * Módulo completado) y el OKR al final. Pastilla verde (>=90%), amarilla
 * (>=70%), roja (<70%) o gris punteada ("Sin medir" — un hueco nunca se ve
 * como incumplimiento), con el motivo en chico debajo. Puramente de lectura:
 * el árbol ya trae todo lo necesario, sin cálculo adicional en esta vista.
 */
export default function EmetrixComoVaCadaCuenta({ cuentas }: { cuentas: EmetrixOkrResultadoCuenta[] }) {
  if (cuentas.length === 0) {
    return <p className="resumen-status">No hay cuentas registradas.</p>;
  }

  return (
    <div className="emetrix-tabla-scroll">
      <table className="roster-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Cuenta</th>
            {KPI_CODIGOS_HOJA.map((codigo) => (
              <th key={codigo}>{HEADER_CORTO[codigo]}</th>
            ))}
            <th>OKR</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => {
            const planos = indicadoresPlanos(c.raiz);
            return (
              <tr key={c.marcaId}>
                <td style={{ textAlign: 'left', fontWeight: 600 }}>
                  {c.marcaNombre}
                  {c.enAlerta && <span className="emetrix-alerta-badge" style={{ marginLeft: 6 }}>⚠</span>}
                </td>
                {KPI_CODIGOS_HOJA.map((codigo) => (
                  <td key={codigo}>{planos[codigo] && <CeldaIndicador indicador={planos[codigo].indicador} />}</td>
                ))}
                <td style={{ fontWeight: 700 }}>
                  <CeldaIndicador indicador={c.raiz.indicador} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
