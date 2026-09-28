// Quién puede ver el menú "Administración" (Padrón, Usuarios, Marcas,
// Exámenes) — por identidad, no por rol: SOLO el usuario de Omar Said, más
// cualquier usuario con rol mesa_control o nomina (los mismos que ya usan el
// importador de Aspel). Ni gerente ni ejecutivo ven Administración por su
// rol — si en el futuro existe otro usuario con rol gerente, tampoco la verá.

import { esRolImportador } from './import-permisos';
import type { Rol } from './types';

const ADMIN_EMAIL = 'said@evolve.com.mx';

export function puedeVerAdministracion(usuario: { email: string; rol: Rol }): boolean {
  return usuario.email.trim().toLowerCase() === ADMIN_EMAIL || esRolImportador(usuario.rol);
}
