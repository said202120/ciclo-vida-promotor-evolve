import { Resend } from 'resend';

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('Falta configurar RESEND_API_KEY.');
    client = new Resend(apiKey);
  }
  return client;
}

// Usa el dominio de pruebas de Resend por defecto — cámbialo a un remitente
// de tu propio dominio verificado (ALERTAS_FROM_EMAIL) cuando lo tengas listo.
const FROM = process.env.ALERTAS_FROM_EMAIL || 'Ciclo de vida del promotor <onboarding@resend.dev>';

export async function sendAlertaEmail(to: string[], subject: string, mensaje: string): Promise<{ id?: string }> {
  if (to.length === 0) return {};

  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text: mensaje,
  });

  if (error) {
    throw new Error(typeof error === 'string' ? error : error.message);
  }
  return { id: data?.id };
}
