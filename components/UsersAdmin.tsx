'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Rol, Usuario } from '@/lib/types';
import { createUsuario, fetchUsuarios } from '@/lib/api-client';

const ROL_LABEL: Record<Rol, string> = {
  gerente: 'Gerente',
  ejecutivo: 'Ejecutivo',
  mesa_control: 'Mesa de Control',
  nomina: 'Nómina',
};

const ROL_OPTIONS: Rol[] = ['gerente', 'ejecutivo', 'mesa_control', 'nomina'];

const ROL_ACCESO: Record<Rol, string> = {
  gerente: 'Tablero completo',
  ejecutivo: 'Tablero completo',
  mesa_control: 'Solo importar Aspel',
  nomina: 'Solo importar Aspel',
};

export default function UsersAdmin() {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('ejecutivo');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    try {
      setUsers(await fetchUsuarios());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de usuarios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await createUsuario({ nombre, email, password, rol });
      setNombre('');
      setEmail('');
      setPassword('');
      setRol('ejecutivo');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Usuarios</h1>
        </div>
        <a className="add-row" href="/">
          ← Volver al tablero
        </a>
      </header>

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Nuevo usuario
        </p>
        <p className="roster-hint">
          No hay autoregistro — cada cuenta se crea aquí a mano y se le entrega el usuario y contraseña directamente.
        </p>
        <form className="users-form" onSubmit={handleCreate}>
          <label>
            Nombre
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label>
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROL_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r]} · {ROL_ACCESO[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="close-month-btn" disabled={creating}>
            {creating ? 'Creando…' : '+ Crear usuario'}
          </button>
        </form>
        {error && <p className="login-error">{error}</p>}
      </div>

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Usuarios con acceso
        </p>
        {loading ? (
          <p>Cargando…</p>
        ) : (
          <table className="roster-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Acceso</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ textAlign: 'left' }}>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`pill ${u.rol === 'gerente' || u.rol === 'ejecutivo' ? 'good' : 'warn'}`}>
                      {ROL_LABEL[u.rol]}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {ROL_ACCESO[u.rol]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
