// Selección y mapeo de la tabla `promotores` (snake_case en DB -> camelCase en la API).
// fecha_ingreso se lee vía to_char para evitar que el driver de Postgres
// reinterprete la fecha con la zona horaria del proceso.

export const PROMOTOR_SELECT_COLUMNS = `
  id, nombre, to_char(fecha_ingreso, 'YYYY-MM-DD') as fecha_ingreso,
  carta, usuario, contrato, imss, materiales, mod1, mod3, mod6, mod12,
  created_at, updated_at
`;

export type PromotorRow = {
  id: string;
  nombre: string;
  fecha_ingreso: string | null;
  carta: boolean;
  usuario: boolean;
  contrato: boolean;
  imss: boolean;
  materiales: boolean;
  mod1: boolean;
  mod3: boolean;
  mod6: boolean;
  mod12: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export function promotorRowToApi(row: PromotorRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    fechaIngreso: row.fecha_ingreso,
    carta: row.carta,
    usuario: row.usuario,
    contrato: row.contrato,
    imss: row.imss,
    materiales: row.materiales,
    mod1: row.mod1,
    mod3: row.mod3,
    mod6: row.mod6,
    mod12: row.mod12,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
