// Qué campos puede mapear/aplicar cada rol de captura dentro del importador
// de Aspel. Sin acceso a base de datos — se usa tanto en el navegador (para
// no mostrar opciones que el usuario no puede usar) como en las rutas de la
// API (para nunca confiar en lo que mande el cliente).

import type { ImportCampo, Rol } from './types';

export type RolImportador = 'mesa_control' | 'nomina';

export function esRolImportador(rol: string): rol is RolImportador {
  return rol === 'mesa_control' || rol === 'nomina';
}

/** Campos (además de "ignorar") que el rol puede mapear y aplicar. RFC es la llave, siempre presente. */
export const CAMPOS_PERMITIDOS: Record<RolImportador, Exclude<ImportCampo, 'ignorar'>[]> = {
  mesa_control: ['rfc', 'contratoFecha'],
  nomina: ['rfc', 'imssFecha'],
};

/** Campos que el rol puede ver de solo lectura dentro del importador, sin poder mapearlos ni aplicarlos. */
export const CAMPOS_SOLO_LECTURA: Record<RolImportador, Exclude<ImportCampo, 'ignorar'>[]> = {
  mesa_control: ['imssFecha'],
  nomina: [],
};

export function campoPermitido(rol: RolImportador, campo: ImportCampo): boolean {
  return campo === 'ignorar' || CAMPOS_PERMITIDOS[rol].includes(campo as Exclude<ImportCampo, 'ignorar'>);
}

/** Roles con acceso al tablero de operaciones (todo lo que no sea el importador). */
export function esRolTablero(rol: Rol): boolean {
  return rol === 'gerente' || rol === 'ejecutivo';
}

/** A dónde debe aterrizar cada rol si intenta entrar a una pantalla que no le corresponde. */
export function rutaInicioPara(rol: Rol): string {
  return esRolImportador(rol) ? '/importar-aspel' : '/';
}
