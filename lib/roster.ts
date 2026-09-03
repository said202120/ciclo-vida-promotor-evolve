import { fetchAllPromotores } from './promotores';
import type { Promotor } from './types';

/** Padrón completo, usado por los endpoints de cálculo (kpis, cerrar). */
export async function fetchRoster(): Promise<Promotor[]> {
  return fetchAllPromotores();
}
