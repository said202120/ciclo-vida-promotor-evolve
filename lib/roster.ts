import { fetchAllPromotores } from './promotores';
import { fetchMaterialesVerificados, fetchVisibilidadMateriales } from './encuestas';
import type { Promotor } from './types';

/**
 * Padrón completo, usado por los endpoints de cálculo (kpis, cerrar). A
 * diferencia de fetchAllPromotores(), aquí sí se rellenan
 * materialesVerificados y materialesFechaVisible (ambos de la comparación
 * sistema-vs-encuesta) — los necesitan el KPI 2.1 y el indicador temprano
 * de visibilidad.
 */
export async function fetchRoster(): Promise<Promotor[]> {
  const [promotores, verificados, fechaVisible] = await Promise.all([
    fetchAllPromotores(),
    fetchMaterialesVerificados(),
    fetchVisibilidadMateriales(),
  ]);
  return promotores.map((p) => ({
    ...p,
    materialesVerificados: verificados.get(p.id) ?? null,
    materialesFechaVisible: fechaVisible.get(p.id) ?? null,
  }));
}
