import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { fetchRoster } from '@/lib/roster';
import { evaluarAlertas, type AlertaTipo } from '@/lib/alerts';
import { listEjecutivoEmails } from '@/lib/users';
import { sendAlertaEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const SUBJECTS: Record<AlertaTipo, (nombre: string) => string> = {
  mes1: (nombre) => `Alerta de materiales · ${nombre} cumplió 1 mes`,
  mes2: (nombre) => `Alerta de materiales · ${nombre} cumplió su periodo de prueba`,
};

// Vercel Cron manda `Authorization: Bearer <CRON_SECRET>` automáticamente
// cuando la variable CRON_SECRET está configurada en el proyecto — así se
// verifica que la llamada venga del scheduler y no de cualquiera con la URL.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

type Resultado = {
  promotorId: string;
  nombre: string;
  tipo: AlertaTipo;
  enviado: boolean;
  error?: string;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const [roster, ejecutivos] = await Promise.all([fetchRoster(), listEjecutivoEmails()]);
  const candidatas = evaluarAlertas(roster);

  const resultados: Resultado[] = [];

  for (const alerta of candidatas) {
    // "Reclama" el envío con el unique(promotor_id, tipo) antes de mandar el
    // correo, para que dos ejecuciones concurrentes nunca manden el mismo
    // correo dos veces. Si ya existía, no hace nada más.
    const { rows } = await sql.query(
      `INSERT INTO alertas_enviadas (promotor_id, tipo) VALUES ($1, $2)
       ON CONFLICT (promotor_id, tipo) DO NOTHING
       RETURNING id`,
      [alerta.promotorId, alerta.tipo]
    );
    if (rows.length === 0) continue; // ya se había enviado antes

    try {
      await sendAlertaEmail(ejecutivos, SUBJECTS[alerta.tipo](alerta.nombre), alerta.mensaje);
      resultados.push({ promotorId: alerta.promotorId, nombre: alerta.nombre, tipo: alerta.tipo, enviado: true });
    } catch (err) {
      resultados.push({
        promotorId: alerta.promotorId,
        nombre: alerta.nombre,
        tipo: alerta.tipo,
        enviado: false,
        error: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }

  return NextResponse.json({
    evaluadas: candidatas.length,
    destinatarios: ejecutivos.length,
    nuevas: resultados.length,
    resultados,
  });
}
