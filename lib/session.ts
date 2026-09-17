// Cookies de sesión firmadas con HMAC-SHA256 usando AUTH_SECRET — sin
// dependencias externas. Implementado con Web Crypto (crypto.subtle) para
// que funcione igual en middleware (Edge runtime) y en route handlers (Node).

export type SessionPayload = {
  userId: string;
  rol: 'gerente' | 'ejecutivo' | 'mesa_control' | 'nomina';
  exp: number; // epoch ms
};

export const SESSION_COOKIE = 'cvp_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
  const str = atob(padded);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifySession(token: string | undefined | null, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;
  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64) as unknown as BufferSource,
      encoder.encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(payloadB64))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
