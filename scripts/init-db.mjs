// Aplica schema.sql contra la base de datos apuntada por POSTGRES_URL.
// Uso:
//   vercel env pull .env.local   (una sola vez, trae POSTGRES_URL de la integración)
//   npm run db:init

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error(
    'Falta POSTGRES_URL. Corre `vercel env pull .env.local` en la raíz del proyecto (con la integración de Supabase ya conectada) y vuelve a intentar.'
  );
  process.exit(1);
}

const schemaPath = path.join(__dirname, '..', 'schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

// Forzamos sslmode=no-verify en la cadena: pg-connection-string trata
// 'require'/'prefer'/'verify-ca' como alias de verificación completa desde
// versiones recientes, así que un `ssl: { rejectUnauthorized: false }` aparte
// no basta si la URL trae sslmode=require (como la de Supabase).
const sslUrl = new URL(connectionString);
sslUrl.searchParams.set('sslmode', 'no-verify');

const client = new pg.Client({ connectionString: sslUrl.toString() });

async function main() {
  await client.connect();
  await client.query(schema);
  console.log('schema.sql aplicado correctamente.');
}

main()
  .catch((err) => {
    console.error('Error aplicando schema.sql:', err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
