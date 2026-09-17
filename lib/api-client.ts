import type {
  AlertaActiva,
  CapacitacionEnvioPayload,
  CapacitacionEnvioResultado,
  CapacitacionModulo,
  CapacitacionModuloConPreguntas,
  CapacitacionPreguntaTipo,
  CapacitacionPublica,
  CapacitacionResultado,
  ComparacionIngreso,
  Dashboard,
  Ejecutivo,
  EncuestaMaterialesPayload,
  EncuestaMaterialesPublica,
  EncuestaPublica,
  EncuestaRespuestaPayload,
  ImportAplicarResultado,
  ImportLogEntry,
  ImportMapeo,
  ImportParseResult,
  IngresoMes,
  Marca,
  MarcaConDetalle,
  MaterialEstado,
  MaterialResumenItem,
  Modulos,
  Promotor,
  PromotorParaImportar,
  RecordatorioMateriales,
  Rol,
  Supervisor,
  SupervisorConMarca,
  Usuario,
} from './types';
import type { RegistroExtraido } from './import-shared';
import type { EncuestaTipo } from './encuestas';

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

export function fetchEncuestaLink(promotorId: string, tipo: EncuestaTipo): Promise<{ codigo: string }> {
  return fetch(`/api/promotores/${promotorId}/encuesta-link?tipo=${tipo}`).then((r) => json(r));
}

export function fetchEncuesta(codigo: string): Promise<EncuestaPublica> {
  return fetch(`/api/encuestas/${codigo}`).then((r) => json(r));
}

export function enviarEncuesta(codigo: string, payload: EncuestaRespuestaPayload): Promise<{ ok: true }> {
  return fetch(`/api/encuestas/${codigo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => json(r));
}

export function fetchEncuestaMateriales(codigo: string): Promise<EncuestaMaterialesPublica> {
  return fetch(`/api/encuestas-materiales/${codigo}`).then((r) => json(r));
}

export function enviarEncuestaMateriales(codigo: string, payload: EncuestaMaterialesPayload): Promise<{ ok: true }> {
  return fetch(`/api/encuestas-materiales/${codigo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => json(r));
}

export function fetchComparacionIngresos(mes: string): Promise<ComparacionIngreso[]> {
  return fetch(`/api/comparacion-ingresos?mes=${mes}`).then((r) => json(r));
}

export function fetchRecordatoriosMateriales(): Promise<RecordatorioMateriales[]> {
  return fetch('/api/recordatorios-materiales').then((r) => json(r));
}

export function fetchMarcas(): Promise<MarcaConDetalle[]> {
  return fetch('/api/marcas').then((r) => json(r));
}

export function fetchSupervisoresConMarca(): Promise<SupervisorConMarca[]> {
  return fetch('/api/supervisores').then((r) => json(r));
}

export function createMarca(nombre: string): Promise<Marca> {
  return fetch('/api/marcas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  }).then((r) => json(r));
}

export function renameMarca(id: string, nombre: string): Promise<{ ok: true }> {
  return fetch(`/api/marcas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  }).then((r) => json(r));
}

export function deleteMarca(id: string): Promise<{ ok: true }> {
  return fetch(`/api/marcas/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function createSupervisor(nombre: string, marcaId: string): Promise<Supervisor> {
  return fetch('/api/supervisores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, marcaId }),
  }).then((r) => json(r));
}

export function renameSupervisor(id: string, nombre: string): Promise<{ ok: true }> {
  return fetch(`/api/supervisores/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  }).then((r) => json(r));
}

export function deleteSupervisor(id: string): Promise<{ ok: true }> {
  return fetch(`/api/supervisores/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function createEjecutivo(nombre: string, marcaId: string): Promise<Ejecutivo> {
  return fetch('/api/ejecutivos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, marcaId }),
  }).then((r) => json(r));
}

export function renameEjecutivo(id: string, nombre: string): Promise<{ ok: true }> {
  return fetch(`/api/ejecutivos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  }).then((r) => json(r));
}

export function deleteEjecutivo(id: string): Promise<{ ok: true }> {
  return fetch(`/api/ejecutivos/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function fetchCapacitacionModulosBasico(): Promise<CapacitacionModulo[]> {
  return fetch('/api/capacitacion-modulos/basico').then((r) => json(r));
}

export function fetchCapacitacionResultados(): Promise<Array<{ promotorId: string } & CapacitacionResultado>> {
  return fetch('/api/capacitaciones/resultados').then((r) => json(r));
}

export function fetchCapacitacionModulosConPreguntas(): Promise<CapacitacionModuloConPreguntas[]> {
  return fetch('/api/capacitacion-modulos').then((r) => json(r));
}

export function createCapacitacionModulo(nombre: string, descripcion: string | null): Promise<CapacitacionModulo> {
  return fetch('/api/capacitacion-modulos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, descripcion }),
  }).then((r) => json(r));
}

export function updateCapacitacionModulo(
  id: string,
  patch: { nombre?: string; descripcion?: string | null; umbralAprobacion?: number }
): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-modulos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json(r));
}

export function deleteCapacitacionModulo(id: string): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-modulos/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function createCapacitacionPregunta(
  moduloId: string,
  texto: string,
  tipo: CapacitacionPreguntaTipo = 'texto',
  campoAbiertoLabel: string | null = null
): Promise<{ id: string; texto: string; tipo: CapacitacionPreguntaTipo; campoAbiertoLabel: string | null }> {
  return fetch('/api/capacitacion-preguntas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduloId, texto, tipo, campoAbiertoLabel }),
  }).then((r) => json(r));
}

export function updateCapacitacionPregunta(
  id: string,
  patch: { texto?: string; tipo?: CapacitacionPreguntaTipo; campoAbiertoLabel?: string | null }
): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-preguntas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json(r));
}

export function deleteCapacitacionPregunta(id: string): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-preguntas/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function createCapacitacionOpcion(preguntaId: string, texto: string): Promise<{ id: string; texto: string; correcta: boolean }> {
  return fetch('/api/capacitacion-opciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preguntaId, texto }),
  }).then((r) => json(r));
}

export function updateCapacitacionOpcionTexto(id: string, texto: string): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-opciones/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  }).then((r) => json(r));
}

export function marcarOpcionCorrecta(id: string, preguntaId: string): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-opciones/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correcta: true, preguntaId }),
  }).then((r) => json(r));
}

export function deleteCapacitacionOpcion(id: string): Promise<{ ok: true }> {
  return fetch(`/api/capacitacion-opciones/${id}`, { method: 'DELETE' }).then((r) => json(r));
}

export function fetchCapacitacionLink(promotorId: string, moduloId: string): Promise<{ codigo: string }> {
  return fetch(`/api/promotores/${promotorId}/capacitacion-link?moduloId=${moduloId}`).then((r) => json(r));
}

export function fetchCapacitacion(codigo: string): Promise<CapacitacionPublica> {
  return fetch(`/api/capacitaciones/${codigo}`).then((r) => json(r));
}

export function enviarCapacitacion(codigo: string, payload: CapacitacionEnvioPayload): Promise<CapacitacionEnvioResultado> {
  return fetch(`/api/capacitaciones/${codigo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => json(r));
}
