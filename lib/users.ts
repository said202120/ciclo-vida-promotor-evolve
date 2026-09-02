import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import type { Rol, Usuario } from './types';

type UsuarioConHash = Usuario & { password_hash: string };

export async function findUserByEmail(email: string): Promise<UsuarioConHash | null> {
  const { rows } = await sql.query(
    'SELECT id, nombre, email, password_hash, rol FROM usuarios WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  return (rows[0] as UsuarioConHash) ?? null;
}

export async function findUserById(id: string): Promise<Usuario | null> {
  const { rows } = await sql.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [id]);
  return (rows[0] as Usuario) ?? null;
}

export async function listUsers(): Promise<Usuario[]> {
  const { rows } = await sql.query('SELECT id, nombre, email, rol FROM usuarios ORDER BY created_at');
  return rows as Usuario[];
}

export async function listEjecutivoEmails(): Promise<string[]> {
  const { rows } = await sql.query("SELECT email FROM usuarios WHERE rol = 'ejecutivo'");
  return rows.map((r) => r.email as string);
}

export async function createUser(data: { nombre: string; email: string; password: string; rol: Rol }): Promise<Usuario> {
  const passwordHash = await bcrypt.hash(data.password, 10);
  const { rows } = await sql.query(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
    [data.nombre.trim(), data.email.toLowerCase().trim(), passwordHash, data.rol]
  );
  return rows[0] as Usuario;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
