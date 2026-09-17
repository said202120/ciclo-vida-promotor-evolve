'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { MarcaConDetalle } from '@/lib/types';
import {
  createEjecutivo,
  createMarca,
  createSupervisor,
  deleteEjecutivo,
  deleteMarca,
  deleteSupervisor,
  fetchMarcas,
  renameEjecutivo,
  renameMarca,
  renameSupervisor,
} from '@/lib/api-client';

export default function MarcasAdmin() {
  const [marcas, setMarcas] = useState<MarcaConDetalle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nuevaMarca, setNuevaMarca] = useState('');
  const [creandoMarca, setCreandoMarca] = useState(false);

  const [nuevoSupervisor, setNuevoSupervisor] = useState<Record<string, string>>({});
  const [nuevoEjecutivo, setNuevoEjecutivo] = useState<Record<string, string>>({});

  function reload() {
    fetchMarcas()
      .then(setMarcas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el maestro de marcas.'));
  }

  useEffect(() => {
    reload();
  }, []);

  function conError<T>(promesa: Promise<T>, mensajeDefault: string): Promise<void> {
    return promesa
      .then(() => {
        setError(null);
        reload();
      })
      .catch((err) => setError(err instanceof Error ? err.message : mensajeDefault));
  }

  async function handleCreateMarca(e: FormEvent) {
    e.preventDefault();
    const nombre = nuevaMarca.trim();
    if (!nombre) return;
    setCreandoMarca(true);
    try {
      await createMarca(nombre);
      setNuevaMarca('');
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la marca.');
    } finally {
      setCreandoMarca(false);
    }
  }

  function handleRenameMarca(id: string, nombreActual: string, valorNuevo: string) {
    const nombre = valorNuevo.trim();
    if (!nombre || nombre === nombreActual) return;
    conError(renameMarca(id, nombre), 'No se pudo renombrar la marca.');
  }

  function handleDeleteMarca(id: string, nombre: string) {
    if (!window.confirm(`¿Eliminar la marca "${nombre}"? También se eliminan sus supervisores y ejecutivos.`)) return;
    conError(deleteMarca(id), 'No se pudo eliminar la marca.');
  }

  async function handleAddSupervisor(marcaId: string) {
    const nombre = (nuevoSupervisor[marcaId] ?? '').trim();
    if (!nombre) return;
    try {
      await createSupervisor(nombre, marcaId);
      setNuevoSupervisor((prev) => ({ ...prev, [marcaId]: '' }));
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el supervisor.');
    }
  }

  function handleRenameSupervisor(id: string, nombreActual: string, valorNuevo: string) {
    const nombre = valorNuevo.trim();
    if (!nombre || nombre === nombreActual) return;
    conError(renameSupervisor(id, nombre), 'No se pudo renombrar al supervisor.');
  }

  function handleDeleteSupervisor(id: string, nombre: string) {
    if (!window.confirm(`¿Eliminar a "${nombre}" de los supervisores?`)) return;
    conError(deleteSupervisor(id), 'No se pudo eliminar al supervisor.');
  }

  async function handleAddEjecutivo(marcaId: string) {
    const nombre = (nuevoEjecutivo[marcaId] ?? '').trim();
    if (!nombre) return;
    try {
      await createEjecutivo(nombre, marcaId);
      setNuevoEjecutivo((prev) => ({ ...prev, [marcaId]: '' }));
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el ejecutivo.');
    }
  }

  function handleRenameEjecutivo(id: string, nombreActual: string, valorNuevo: string) {
    const nombre = valorNuevo.trim();
    if (!nombre || nombre === nombreActual) return;
    conError(renameEjecutivo(id, nombre), 'No se pudo renombrar al ejecutivo.');
  }

  function handleDeleteEjecutivo(id: string, nombre: string) {
    if (!window.confirm(`¿Eliminar a "${nombre}" de los ejecutivos?`)) return;
    conError(deleteEjecutivo(id), 'No se pudo eliminar al ejecutivo.');
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Marcas, supervisores y ejecutivos</h1>
        </div>
        <a className="topbar-link" href="/">
          ← Volver al tablero
        </a>
      </header>

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Nueva marca
        </p>
        <form className="users-form" onSubmit={handleCreateMarca}>
          <label>
            Nombre
            <input type="text" value={nuevaMarca} onChange={(e) => setNuevaMarca(e.target.value)} required />
          </label>
          <button type="submit" className="close-month-btn" disabled={creandoMarca}>
            {creandoMarca ? 'Creando…' : '+ Crear marca'}
          </button>
        </form>
        {error && <p className="login-error">{error}</p>}
      </div>

      {!marcas ? (
        <p className="resumen-status">Cargando…</p>
      ) : (
        marcas.map((marca) => (
          <div className="roster" key={marca.id}>
            <div className="roster-head">
              <input
                type="text"
                className="marca-nombre-input"
                defaultValue={marca.nombre}
                onBlur={(e) => handleRenameMarca(marca.id, marca.nombre, e.target.value)}
              />
              <button className="del-btn" title="Eliminar marca" onClick={() => handleDeleteMarca(marca.id, marca.nombre)}>
                ✕
              </button>
            </div>

            <div className="marca-detalle-grid">
              <div>
                <p className="roster-hint" style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--ink)' }}>
                  Supervisores ({marca.supervisores.length})
                </p>
                <ul className="persona-lista">
                  {marca.supervisores.map((s) => (
                    <li key={s.id}>
                      <input
                        type="text"
                        defaultValue={s.nombre}
                        onBlur={(e) => handleRenameSupervisor(s.id, s.nombre, e.target.value)}
                      />
                      <button className="del-btn" title="Eliminar" onClick={() => handleDeleteSupervisor(s.id, s.nombre)}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="persona-nueva">
                  <input
                    type="text"
                    placeholder="Nuevo supervisor"
                    value={nuevoSupervisor[marca.id] ?? ''}
                    onChange={(e) => setNuevoSupervisor((prev) => ({ ...prev, [marca.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSupervisor(marca.id);
                      }
                    }}
                  />
                  <button type="button" className="add-row" onClick={() => handleAddSupervisor(marca.id)}>
                    + Agregar
                  </button>
                </div>
              </div>

              <div>
                <p className="roster-hint" style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--ink)' }}>
                  Ejecutivos ({marca.ejecutivos.length})
                </p>
                <ul className="persona-lista">
                  {marca.ejecutivos.map((ej) => (
                    <li key={ej.id}>
                      <input
                        type="text"
                        defaultValue={ej.nombre}
                        onBlur={(e) => handleRenameEjecutivo(ej.id, ej.nombre, e.target.value)}
                      />
                      <button className="del-btn" title="Eliminar" onClick={() => handleDeleteEjecutivo(ej.id, ej.nombre)}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="persona-nueva">
                  <input
                    type="text"
                    placeholder="Nuevo ejecutivo"
                    value={nuevoEjecutivo[marca.id] ?? ''}
                    onChange={(e) => setNuevoEjecutivo((prev) => ({ ...prev, [marca.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEjecutivo(marca.id);
                      }
                    }}
                  />
                  <button type="button" className="add-row" onClick={() => handleAddEjecutivo(marca.id)}>
                    + Agregar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
