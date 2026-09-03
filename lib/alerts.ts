// Lógica de las alertas de materiales — dos momentos por promotor, basados
// en su fecha de ingreso. Puramente funcional: no toca la base de datos (el
// dedupe contra alertas_enviadas y el envío de correo viven en el caller).

import { materialesCompletos, type Promotor } from './types';

export type AlertaTipo = 'mes1' | 'mes2';

export type AlertaCandidata = {
  promotorId: string;
  nombre: string;
  tipo: AlertaTipo;
  mensaje: string;
};

const MES2_WINDOW_START_DIAS = 60;
const MES2_WINDOW_END_DIAS = 67;

export const mensajeMes1 = (nombre: string) =>
  `El promotor ${nombre} cumplió un mes — es necesario que empieces a ver la compra de sus materiales de trabajo.`;

export const mensajeMes2 = (nombre: string) =>
  `Prepara el envío de materiales para el colaborador ${nombre}, ya cumplió su periodo de prueba y es necesario hacerle llegar sus materiales de trabajo.`;

function parseFechaIngreso(fechaIngreso: string): Date {
  const [y, m, d] = fechaIngreso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function soloFecha(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Suma meses de calendario, recortando al último día del mes destino si el
// mes de origen tenía más días (ej. 31 ene + 1 mes -> 28/29 feb, no marzo).
function addMonthsClamped(date: Date, months: number): Date {
  const totalMonths = date.getFullYear() * 12 + date.getMonth() + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(date.getDate(), lastDayOfTargetMonth));
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function diasEntre(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

/**
 * Evalúa el padrón completo contra una fecha de referencia (por defecto
 * "hoy") y devuelve las alertas que aplican EN ESE DÍA — sin filtrar aún
 * contra lo ya enviado ni contra si el promotor ya no existe; eso lo hace
 * el caller (la ruta de cron) contra alertas_enviadas.
 */
export function evaluarAlertas(roster: Promotor[], referencia: Date = new Date()): AlertaCandidata[] {
  const hoy = soloFecha(referencia);
  const alertas: AlertaCandidata[] = [];

  for (const p of roster) {
    if (!p.fechaIngreso) continue;
    const ingreso = parseFechaIngreso(p.fechaIngreso);

    // mes1: el día exacto (aniversario de calendario) en que cumple 1 mes.
    if (isSameDate(addMonthsClamped(ingreso, 1), hoy)) {
      alertas.push({ promotorId: p.id, nombre: p.nombre, tipo: 'mes1', mensaje: mensajeMes1(p.nombre) });
    }

    // mes2: ventana de una semana tras cumplir 2 meses (día 60-67), y solo
    // si todavía no tiene marcados los 13 materiales como entregados.
    if (!materialesCompletos(p)) {
      const dias = diasEntre(ingreso, hoy);
      if (dias >= MES2_WINDOW_START_DIAS && dias <= MES2_WINDOW_END_DIAS) {
        alertas.push({ promotorId: p.id, nombre: p.nombre, tipo: 'mes2', mensaje: mensajeMes2(p.nombre) });
      }
    }
  }

  return alertas;
}
