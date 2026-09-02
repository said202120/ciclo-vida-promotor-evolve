'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Usuario } from '@/lib/types';
import { createUsuario, fetchUsuarios } from '@/lib/api-client';

export default function UsersAdmin() {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      await createUsuario({ nombre, email, password });
      setNombre('');
      setEmail('');
      setPassword('');
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
          Nuevo usuario ejecutivo
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
          <button type="submit" className="close-month-btn" disabled={creating}>
            {creating ? 'Creando…' : '+ Crear ejecutivo'}
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
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ textAlign: 'left' }}>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`pill ${u.rol === 'gerente' ? 'good' : 'na'}`}>{u.rol}</span>
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
