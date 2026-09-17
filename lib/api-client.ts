import type {
  AlertaActiva,
  Dashboard,
  ImportAplicarResultado,
  ImportLogEntry,
  ImportMapeo,
  ImportParseResult,
  IngresoMes,
  MaterialEstado,
  MaterialResumenItem,
  Modulos,
  Promotor,
  PromotorParaImportar,
  Rol,
  Usuario,
} from './types';
import type { RegistroExtraido } from './import-shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

export function fetchMeses(): Promise<{ meses: string[]; actual: string }> {
  return fetch('/api/meses').then((r) => json(r));
}

export function fetchPromotores(): Promise<Promotor[]> {
  return fetch('/api/promotores').then((r) => json(r));
}

export function createPromotor(data: { nombre: string; fechaIngreso: string }): Promise<Promotor> {
  return fetch('/api/promotores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => json(r));
}

export function updatePromotor(id: string, patch: Partial<Omit<Promotor, 'id'>>): Promise<Promotor> {
  return fetch(`/api/promotores/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json(r));
}

export function deletePromotor(id: string): Promise<{ ok: true }> {
  return fetch(`/api/promotores/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function fetchModulos(): Promise<Modulos> {
  return fetch('/api/modulos').then((r) => json(r));
}

export function updateModulos(patch: Partial<Modulos>): Promise<Modulos> {
  return fetch('/api/modulos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json(r));
}

export function fetchDashboard(mes: string): Promise<Dashboard> {
  return fetch(`/api/kpis?mes=${mes}`).then((r) => json(r));
}

export function cerrarMes(mes: string): Promise<Dashboard> {
  return fetch('/api/cierres/cerrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mes }),
  }).then((r) => json(r));
}

export function fetchMe(): Promise<Usuario> {
  return fetch('/api/auth/me').then((r) => json(r));
}

export function logout(): Promise<{ ok: true }> {
  return fetch('/api/auth/logout', { method: 'POST' }).then((r) => json(r));
}

export function changePassword(passwordActual: string, passwordNueva: string): Promise<{ ok: true }> {
  return fetch('/api/auth/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passwordActual, passwordNueva }),
  }).then((r) => json(r));
}

export function fetchUsuarios(): Promise<Usuario[]> {
  return fetch('/api/usuarios').then((r) => json(r));
}

export function createUsuario(data: { nombre: string; email: string; password: string; rol: Rol }): Promise<Usuario> {
  return fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => json(r));
}

export function fetchAlertas(): Promise<AlertaActiva[]> {
  return fetch('/api/alertas').then((r) => json(r));
}

export function fetchPromotorMateriales(promotorId: string): Promise<MaterialEstado[]> {
  return fetch(`/api/promotores/${promotorId}/materiales`).then((r) => json(r));
}

export function fetchMaterialesResumen(): Promise<MaterialResumenItem[]> {
  return fetch('/api/materiales/resumen').then((r) => json(r));
}

export function parseImportFile(file: File): Promise<ImportParseResult> {
  const form = new FormData();
  form.append('file', file);
  return fetch('/api/importaciones/parse', { method: 'POST', body: form }).then((r) => json(r));
}

export function fetchImportConfig(): Promise<ImportMapeo> {
  return fetch('/api/importaciones/config').then((r) => json(r));
}

export function saveImportConfig(mapeo: ImportMapeo): Promise<ImportMapeo> {
  return fetch('/api/importaciones/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapeo }),
  }).then((r) => json(r));
}

export function aplicarImportacion(registros: RegistroExtraido[]): Promise<ImportAplicarResultado> {
  return fetch('/api/importaciones/aplicar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registros }),
  }).then((r) => json(r));
}

export function fetchImportLog(): Promise<ImportLogEntry[]> {
  return fetch('/api/importaciones/log').then((r) => json(r));
}

export function fetchPromotoresParaImportar(): Promise<PromotorParaImportar[]> {
  return fetch('/api/importaciones/promotores').then((r) => json(r));
}

export function fetchIngresosMes(mes: string): Promise<IngresoMes[]> {
  return fetch(`/api/mesa-control/ingresos?mes=${mes}`).then((r) => json(r));
}

export function updateIngresoCampo(id: string, campo: 'carta' | 'usuario', valor: boolean): Promise<{ ok: true }> {
  return fetch(`/api/mesa-control/ingresos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campo, valor }),
  }).then((r) => json(r));
}

export function updatePromotorMaterial(
  promotorId: string,
  materialId: string,
  entregado: boolean
): Promise<MaterialEstado[]> {
  return fetch(`/api/promotores/${promotorId}/materiales`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ materialId, entregado }),
  }).then((r) => json(r));
}
