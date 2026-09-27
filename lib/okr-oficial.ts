// Nombres LITERALES del OKR oficial "Ciclo de vida del promotor", copiados
// exactamente como los entregó Dirección — archivo de DATOS, sin lógica
// (ningún cálculo, ningún import de otro módulo de la app). Toda la app
// (pantalla, descarga en Excel y la lectura para EvolveOS en
// GET /api/okr-resultados) lee los nombres oficiales de aquí — nunca hay una
// segunda copia del texto en otro archivo. Ver docs/ficha-tecnica-okr-
// ponderacion.md sección 4-ter.
//
// `codigo` es el código interno que ya usa el árbol OKR (`EmetrixOkrNodo.codigo`
// en construirArbolOkr, lib/emetrix-ponderacion-calc.ts) — así se cruza este
// archivo de datos contra el árbol sin repetir el texto. `kpiCode` es el
// código que use EvolveOS para ese mismo indicador — Dirección todavía no lo
// definió, así que queda `null` en los 3 niveles hasta que lo entreguen (no
// inventar un código propio).

export type OkrOficialKpi = {
  codigo: string;
  nombreOficial: string;
  /** Meta oficial del KPI, en % (100 o 90 según el KPI). */
  meta: number;
  kpiCode: string | null;
};

export type OkrOficialKr = {
  codigo: string;
  nombreOficial: string;
  kpiCode: string | null;
  kpis: OkrOficialKpi[];
};

export type OkrOficial = {
  nombreOficial: string;
  kpiCode: string | null;
  krs: OkrOficialKr[];
};

export const OKR_OFICIAL: OkrOficial = {
  nombreOficial: 'Ciclo de vida del promotor',
  kpiCode: null,
  krs: [
    {
      codigo: 'KR1',
      nombreOficial: 'Kit administrativo entregado a tiempo',
      kpiCode: null,
      kpis: [
        {
          codigo: 'KR1.1',
          nombreOficial: '% de nuevos ingresos con carta de acceso y credencial entregadas antes del primer día',
          meta: 100,
          kpiCode: null,
        },
        {
          codigo: 'KR1.2',
          nombreOficial: '% de nuevos ingresos con usuario creado en Emetrix antes del primer día',
          meta: 100,
          kpiCode: null,
        },
        {
          codigo: 'KR1.3',
          nombreOficial: '% de nuevos ingresos con contrato firmado antes del primer día',
          meta: 100,
          kpiCode: null,
        },
        {
          codigo: 'KR1.4',
          nombreOficial: '% de nuevos ingresos con alta ante el IMSS antes del primer día',
          meta: 100,
          kpiCode: null,
        },
      ],
    },
    {
      codigo: 'KR2',
      nombreOficial: 'Materiales de campo entregados en calendario',
      kpiCode: null,
      kpis: [
        {
          codigo: 'KR2.1',
          nombreOficial: '% de nuevos ingresos con materiales entregados dentro del calendario comprometido',
          meta: 100,
          kpiCode: null,
        },
      ],
    },
    {
      codigo: 'KR3',
      nombreOficial: 'Capacitación en módulos',
      kpiCode: null,
      kpis: [
        {
          codigo: 'KR3.1',
          nombreOficial: '% de módulos publicados y vigentes en Emetrix según el calendario comprometido',
          meta: 100,
          kpiCode: null,
        },
        {
          codigo: 'KR3.2',
          nombreOficial: '% de promotores con el módulo que les toca por antigüedad completado',
          meta: 90,
          kpiCode: null,
        },
      ],
    },
  ],
};
