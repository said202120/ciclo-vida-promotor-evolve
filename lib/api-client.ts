import type { AlertaActiva, Dashboard, Modulos, Promotor, Usuario } from './types';

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

export function fetchUsuarios(): Promise<Usuario[]> {
  return fetch('/api/usuarios').then((r) => json(r));
}

export function createUsuario(data: { nombre: string; email: string; password: string }): Promise<Usuario> {
  return fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => json(r));
}

export function fetchAlertas(): Promise<AlertaActiva[]> {
  return fetch('/api/alertas').then((r) => json(r));
}
