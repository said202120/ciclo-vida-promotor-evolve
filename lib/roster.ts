import { fetchAllPromotores } from './promotores';
import { fetchMaterialesVerificados } from './encuestas';
import type { Promotor } from './types';

/**
 * Padrón completo, usado por los endpoints de cálculo (kpis, cerrar). A
 * diferencia de fetchAllPromotores(), aquí sí se rellena
 * materialesVerificados (comparación sistema-vs-encuesta) — lo necesita el
 * KPI 2.1.
 */
export async function fetchRoster(): Promise<Promotor[]> {
  const [promotores, verificados] = await Promise.all([fetchAllPromotores(), fetchMaterialesVerificados()]);
  return promotores.map((p) => ({ ...p, materialesVerificados: verificados.get(p.id) ?? null }));
}
