'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { changePassword } from '@/lib/api-client';

export default function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function resetForm() {
    setPasswordActual('');
    setPasswordNueva('');
    setPasswordConfirmar('');
    setError(null);
    setSuccess(false);
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
    } else {
      resetForm();
      setOpen(true);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (passwordNueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }

    setSaving(true);
    try {
      await changePassword(passwordActual, passwordNueva);
      setSuccess(true);
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordConfirmar('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="password-cell" ref={boxRef}>
      <button type="button" className="topbar-link" onClick={handleToggle}>
        Cambiar contraseña
      </button>
      {open && (
        <div className="password-popover" role="dialog">
          <form onSubmit={handleSubmit}>
            <label>
              Contraseña actual
              <input
                type="password"
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                required
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <label>
              Nueva contraseña
              <input
                type="password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirmar nueva contraseña
              <input
                type="password"
                value={passwordConfirmar}
                onChange={(e) => setPasswordConfirmar(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            {success && <p className="resumen-status import-success">Contraseña actualizada.</p>}
            <button type="submit" className="close-month-btn" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar nueva contraseña'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
