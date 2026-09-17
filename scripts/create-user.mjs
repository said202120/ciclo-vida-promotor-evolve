// Crea (o actualiza la contraseña de) un usuario en la tabla `usuarios`.
// Se usa para dar de alta al primer gerente — no hay autoregistro, todos los
// usuarios (gerente, ejecutivo, mesa_control, nomina) se crean a mano.
//
// Uso:
//   npm run user:create -- --nombre "Omar Said" --email said@evolve.com.mx --password "xxxxxxxx" --rol gerente

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

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

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      args[key] = value;
      i++;
    }
  }
  return args;
}

loadEnvLocal();

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Falta POSTGRES_URL. Corre `vercel env pull .env.local` y vuelve a intentar.');
  process.exit(1);
}

const { nombre, email, password, rol } = parseArgs();
if (!nombre || !email || !password || !rol) {
  console.error('Uso: npm run user:create -- --nombre "Nombre" --email correo@evolve.com.mx --password "xxxxxxxx" --rol gerente|ejecutivo');
  process.exit(1);
}
const ROLES_VALIDOS = ['gerente', 'ejecutivo', 'mesa_control', 'nomina'];
if (!ROLES_VALIDOS.includes(rol)) {
  console.error(`--rol debe ser uno de: ${ROLES_VALIDOS.join(', ')}.`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('--password debe tener al menos 8 caracteres.');
  process.exit(1);
}

const sslUrl = new URL(connectionString);
sslUrl.searchParams.set('sslmode', 'no-verify');
const client = new pg.Client({ connectionString: sslUrl.toString() });

async function main() {
  await client.connect();
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await client.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       password_hash = EXCLUDED.password_hash,
       rol = EXCLUDED.rol
     RETURNING id, nombre, email, rol`,
    [nombre.trim(), email.trim().toLowerCase(), passwordHash, rol]
  );
  console.log('Usuario listo:', rows[0]);
}

main()
  .catch((err) => {
    console.error('Error creando usuario:', err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
