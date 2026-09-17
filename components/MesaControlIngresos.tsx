'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IngresoMes } from '@/lib/types';
import { fetchIngresosMes, logout, updateIngresoCampo } from '@/lib/api-client';
import ChangePasswordButton from './ChangePasswordButton';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(mesKey: string, delta: number): string {
  const [y, m] = mesKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function labelForMonth(mesKey: string): string {
  const [y, m] = mesKey.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function monthsSince(fechaIngreso: string): number {
  const ing = new Date(fechaIngreso + 'T00:00:00');
  const now = new Date();
  return (now.getFullYear() - ing.getFullYear()) * 12 + (now.getMonth() - ing.getMonth());
}

export default function MesaControlIngresos() {
  const router = useRouter();
  const [mes, setMes] = useState(currentMonthKey());
  const [ingresos, setIngresos] = useState<IngresoMes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());

  function reload(mesActual: string) {
    setError(null);
    fetchIngresosMes(mesActual)
      .then(setIngresos)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los ingresos del mes.'));
  }

  useEffect(() => {
    setIngresos(null);
    reload(mes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  async function handleToggle(promotorId: string, campo: 'carta' | 'usuario', valor: boolean) {
    setIngresos((prev) => (prev ? prev.map((p) => (p.id === promotorId ? { ...p, [campo]: valor } : p)) : prev));
    setPendientes((prev) => new Set(prev).add(`${promotorId}-${campo}`));
    try {
      await updateIngresoCampo(promotorId, campo, valor);
    } catch (err) {
      // revierte si falla
      setIngresos((prev) => (prev ? prev.map((p) => (p.id === promotorId ? { ...p, [campo]: !valor } : p)) : prev));
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.');
    } finally {
      setPendientes((prev) => {
        const next = new Set(prev);
        next.delete(`${promotorId}-${campo}`);
        return next;
      });
    }
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve · Mesa de Control</p>
          <h1>Carta de ingreso y Usuario Emetrix</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a className="topbar-link" href="/importar-aspel">
            Importar Aspel
          </a>
          <ChangePasswordButton />
          <button type="button" className="topbar-link" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <p className="roster-hint" style={{ margin: '-8px 0 20px' }}>
        Checklist de los nuevos ingresos del mes — al marcar una casilla se guarda directo en el padrón, sin archivo
        ni importador de por medio.
      </p>

      <div className="roster">
        <div className="roster-head">
          <p className="section-title" style={{ margin: 0 }}>
            Nuevos ingresos · {labelForMonth(mes)}
          </p>
          <div className="month-bar">
            <button onClick={() => setMes((m) => shiftMonth(m, -1))}>←</button>
            <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>
              {labelForMonth(mes)}
            </span>
            <button onClick={() => setMes((m) => shiftMonth(m, 1))}>→</button>
          </div>
        </div>
        <p className="roster-hint">
          Mismo criterio que el resto del sistema: promotores cuya fecha de ingreso cae dentro de este mes.
        </p>

        {error && <p className="login-error">{error}</p>}

        {!ingresos ? (
          <p className="resumen-status">Cargando…</p>
        ) : ingresos.length === 0 ? (
          <div className="empty-roster">
            <div className="empty-icon">🧭</div>
            Sin nuevos ingresos en {labelForMonth(mes)}.
          </div>
        ) : (
          <table className="roster-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ingreso</th>
                <th>Antig.</th>
                <th>Carta de ingreso</th>
                <th>Usuario Emetrix</th>
              </tr>
            </thead>
            <tbody>
              {ingresos.map((p) => (
                <tr key={p.id}>
                  <td style={{ textAlign: 'left' }}>{p.nombre}</td>
                  <td className="mono">{p.fechaIngreso}</td>
                  <td className="antig">{monthsSince(p.fechaIngreso)}m</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.carta}
                      disabled={pendientes.has(`${p.id}-carta`)}
                      onChange={(e) => handleToggle(p.id, 'carta', e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.usuario}
                      disabled={pendientes.has(`${p.id}-usuario`)}
                      onChange={(e) => handleToggle(p.id, 'usuario', e.target.checked)}
                    />
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
