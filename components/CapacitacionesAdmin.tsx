'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CapacitacionModuloConPreguntas } from '@/lib/types';
import {
  createCapacitacionModulo,
  createCapacitacionOpcion,
  createCapacitacionPregunta,
  deleteCapacitacionModulo,
  deleteCapacitacionOpcion,
  deleteCapacitacionPregunta,
  fetchCapacitacionModulosConPreguntas,
  marcarOpcionCorrecta,
  updateCapacitacionModulo,
  updateCapacitacionOpcionTexto,
  updateCapacitacionPregunta,
} from '@/lib/api-client';

export default function CapacitacionesAdmin() {
  const [modulos, setModulos] = useState<CapacitacionModuloConPreguntas[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [creando, setCreando] = useState(false);

  const [nuevaPregunta, setNuevaPregunta] = useState<Record<string, string>>({});
  const [nuevaOpcion, setNuevaOpcion] = useState<Record<string, string>>({});

  function reload() {
    fetchCapacitacionModulosConPreguntas()
      .then(setModulos)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el contenido de capacitación.'));
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

  async function handleCreateModulo(e: FormEvent) {
    e.preventDefault();
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      await createCapacitacionModulo(nombre, nuevaDescripcion.trim() || null);
      setNuevoNombre('');
      setNuevaDescripcion('');
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el módulo.');
    } finally {
      setCreando(false);
    }
  }

  function handleRenameModulo(id: string, actual: string, valorNuevo: string) {
    const nombre = valorNuevo.trim();
    if (!nombre || nombre === actual) return;
    conError(updateCapacitacionModulo(id, { nombre }), 'No se pudo renombrar el módulo.');
  }

  function handleDescripcionModulo(id: string, actual: string | null, valorNuevo: string) {
    const descripcion = valorNuevo.trim() || null;
    if (descripcion === actual) return;
    conError(updateCapacitacionModulo(id, { descripcion }), 'No se pudo actualizar la descripción.');
  }

  function handleUmbralModulo(id: string, actual: number, valorNuevo: string) {
    const umbral = parseInt(valorNuevo, 10);
    if (!Number.isFinite(umbral) || umbral === actual) return;
    conError(updateCapacitacionModulo(id, { umbralAprobacion: umbral }), 'No se pudo actualizar el umbral de aprobación.');
  }

  function handleDeleteModulo(id: string, nombre: string) {
    if (!window.confirm(`¿Eliminar el módulo "${nombre}"? También se eliminan sus preguntas y opciones.`)) return;
    conError(deleteCapacitacionModulo(id), 'No se pudo eliminar el módulo.');
  }

  async function handleAddPregunta(moduloId: string) {
    const texto = (nuevaPregunta[moduloId] ?? '').trim();
    if (!texto) return;
    try {
      await createCapacitacionPregunta(moduloId, texto);
      setNuevaPregunta((prev) => ({ ...prev, [moduloId]: '' }));
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar la pregunta.');
    }
  }

  function handleRenamePregunta(id: string, actual: string, valorNuevo: string) {
    const texto = valorNuevo.trim();
    if (!texto || texto === actual) return;
    conError(updateCapacitacionPregunta(id, texto), 'No se pudo actualizar la pregunta.');
  }

  function handleDeletePregunta(id: string) {
    if (!window.confirm('¿Eliminar esta pregunta y sus opciones?')) return;
    conError(deleteCapacitacionPregunta(id), 'No se pudo eliminar la pregunta.');
  }

  async function handleAddOpcion(preguntaId: string) {
    const texto = (nuevaOpcion[preguntaId] ?? '').trim();
    if (!texto) return;
    try {
      await createCapacitacionOpcion(preguntaId, texto);
      setNuevaOpcion((prev) => ({ ...prev, [preguntaId]: '' }));
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar la opción.');
    }
  }

  function handleRenameOpcion(id: string, actual: string, valorNuevo: string) {
    const texto = valorNuevo.trim();
    if (!texto || texto === actual) return;
    conError(updateCapacitacionOpcionTexto(id, texto), 'No se pudo actualizar la opción.');
  }

  function handleMarcarCorrecta(preguntaId: string, opcionId: string) {
    conError(marcarOpcionCorrecta(opcionId, preguntaId), 'No se pudo marcar la opción correcta.');
  }

  function handleDeleteOpcion(id: string) {
    conError(deleteCapacitacionOpcion(id), 'No se pudo eliminar la opción.');
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Exámenes de capacitación</h1>
        </div>
        <a className="topbar-link" href="/">
          ← Volver al tablero
        </a>
      </header>

      <div className="roster">
        <p className="section-title" style={{ margin: '0 0 14px' }}>
          Nuevo módulo
        </p>
        <form className="users-form" onSubmit={handleCreateModulo}>
          <label>
            Nombre
            <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} required />
          </label>
          <label>
            Descripción (opcional)
            <input type="text" value={nuevaDescripcion} onChange={(e) => setNuevaDescripcion(e.target.value)} />
          </label>
          <button type="submit" className="close-month-btn" disabled={creando}>
            {creando ? 'Creando…' : '+ Crear módulo'}
          </button>
        </form>
        {error && <p className="login-error">{error}</p>}
      </div>

      {!modulos ? (
        <p className="resumen-status">Cargando…</p>
      ) : (
        modulos.map((modulo) => (
          <div className="roster" key={modulo.id}>
            <div className="roster-head">
              <input
                type="text"
                className="marca-nombre-input"
                defaultValue={modulo.nombre}
                onBlur={(e) => handleRenameModulo(modulo.id, modulo.nombre, e.target.value)}
              />
              <div className="roster-head-actions">
                <label className="capacitacion-umbral-label">
                  Aprobar con
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="capacitacion-umbral-input"
                    defaultValue={modulo.umbralAprobacion}
                    onBlur={(e) => handleUmbralModulo(modulo.id, modulo.umbralAprobacion, e.target.value)}
                  />
                  %
                </label>
                <button className="del-btn" title="Eliminar módulo" onClick={() => handleDeleteModulo(modulo.id, modulo.nombre)}>
                  ✕
                </button>
              </div>
            </div>
            <input
              type="text"
              className="capacitacion-descripcion-input"
              placeholder="Descripción (opcional)"
              defaultValue={modulo.descripcion ?? ''}
              onBlur={(e) => handleDescripcionModulo(modulo.id, modulo.descripcion, e.target.value)}
            />

            <p className="roster-hint" style={{ margin: '14px 0 8px', fontWeight: 600, color: 'var(--ink)' }}>
              Preguntas ({modulo.preguntas.length})
            </p>

            {modulo.preguntas.map((pregunta, idx) => (
              <div className="capacitacion-pregunta-card" key={pregunta.id}>
                <div className="capacitacion-pregunta-head">
                  <span className="capacitacion-pregunta-num">{idx + 1}.</span>
                  <input
                    type="text"
                    defaultValue={pregunta.texto}
                    onBlur={(e) => handleRenamePregunta(pregunta.id, pregunta.texto, e.target.value)}
                  />
                  <button className="del-btn" title="Eliminar pregunta" onClick={() => handleDeletePregunta(pregunta.id)}>
                    ✕
                  </button>
                </div>
                <ul className="persona-lista">
                  {pregunta.opciones.map((opcion) => (
                    <li key={opcion.id}>
                      <label className="capacitacion-opcion-radio">
                        <input
                          type="radio"
                          name={`correcta-${pregunta.id}`}
                          checked={opcion.correcta}
                          onChange={() => handleMarcarCorrecta(pregunta.id, opcion.id)}
                        />
                      </label>
                      <input
                        type="text"
                        defaultValue={opcion.texto}
                        onBlur={(e) => handleRenameOpcion(opcion.id, opcion.texto, e.target.value)}
                      />
                      <button className="del-btn" title="Eliminar opción" onClick={() => handleDeleteOpcion(opcion.id)}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="persona-nueva">
                  <input
                    type="text"
                    placeholder="Nueva opción"
                    value={nuevaOpcion[pregunta.id] ?? ''}
                    onChange={(e) => setNuevaOpcion((prev) => ({ ...prev, [pregunta.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddOpcion(pregunta.id);
                      }
                    }}
                  />
                  <button type="button" className="add-row" onClick={() => handleAddOpcion(pregunta.id)}>
                    + Agregar opción
                  </button>
                </div>
              </div>
            ))}

            <div className="persona-nueva" style={{ marginTop: 10 }}>
              <input
                type="text"
                placeholder="Nueva pregunta"
                value={nuevaPregunta[modulo.id] ?? ''}
                onChange={(e) => setNuevaPregunta((prev) => ({ ...prev, [modulo.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPregunta(modulo.id);
                  }
                }}
              />
              <button type="button" className="add-row" onClick={() => handleAddPregunta(modulo.id)}>
                + Agregar pregunta
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
