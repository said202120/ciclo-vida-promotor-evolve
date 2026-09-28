// Quién ve qué dentro del menú "Administración" — por identidad, no por rol.
// Dos niveles:
//   - puedeVerAdministracion: entra al menú y a Padrón (con Importar Aspel) —
//     el usuario de Omar Said, más mesa_control/nomina (los mismos que ya
//     usan el importador de Aspel).
//   - puedeVerAdminCompleta: además ve Usuarios, Marcas y Exámenes — SOLO el
//     usuario de Omar Said. mesa_control/nomina NUNCA ven estas 3, aunque
//     puedeVerAdministracion sea true para ellos.
// Ni gerente ni ejecutivo ven nada de esto por su rol — si en el futuro
// existe otro usuario con rol gerente, tampoco lo verá.

import { esRolImportador } from './import-permisos';
import type { Rol } from './types';

const ADMIN_EMAIL = 'said@evolve.com.mx';

function esAdminPorEmail(usuario: { email: string }): boolean {
  return usuario.email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function puedeVerAdministracion(usuario: { email: string; rol: Rol }): boolean {
  return esAdminPorEmail(usuario) || esRolImportador(usuario.rol);
}

export function puedeVerAdminCompleta(usuario: { email: string }): boolean {
  return esAdminPorEmail(usuario);
}
