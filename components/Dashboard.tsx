'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AlertaActiva, Dashboard as DashboardData, MaterialEstado, Modulos, Promotor, Usuario } from '@/lib/types';
import {
  cerrarMes,
  createPromotor,
  deletePromotor,
  fetchAlertas,
  fetchDashboard,
  fetchMe,
  fetchMeses,
  fetchModulos,
  fetchPromotores,
  logout,
  updateModulos,
  updatePromotor,
  updatePromotorMaterial,
} from '@/lib/api-client';
import ScoreRing from './ScoreRing';
import Pipeline from './Pipeline';
import RosterTable from './RosterTable';
import Lane from './Lane';
import KpiRow from './KpiRow';
import ModuleToggles from './ModuleToggles';
import AlertBanner from './AlertBanner';
import MaterialesResumen from './MaterialesResumen';
import ChangePasswordButton from './ChangePasswordButton';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function labelForMonth(key: string) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function TopBar({ user, onLogout }: { user: Usuario | null; onLogout: () => void }) {
  return (
    <div className="topbar">
      <div className="topbar-user">
        {user && (
          <>
            <span className="topbar-user-name">
              {user.nombre} <span className="topbar-user-rol">· {user.rol}</span>
            </span>
            {user.rol === 'gerente' && (
              <a className="topbar-link" href="/usuarios">
                Usuarios
              </a>
            )}
            <ChangePasswordButton />
            <button className="topbar-link" onClick={onLogout}>
              Cerrar sesión
            </button>
          </>
        )}
      </div>
      <Image src="/logo_pag-1.png" alt="Evolve" width={136} height={42} priority className="topbar-logo" />
    </div>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<Usuario | null>(null);
  const [meses, setMeses] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [promotores, setPromotores] = useState<Promotor[]>([]);
  const [modulos, setModulos] = useState<Modulos | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [alertas, setAlertas] = useState<AlertaActiva[]>([]);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function flashSaved() {
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 1400);
  }

  function reportError(err: unknown) {
    setError(err instanceof Error ? err.message : 'Ocurrió un error.');
    setTimeout(() => setError(null), 4000);
  }

  useEffect(() => {
    (async () => {
      try {
        const [meRes, mesesRes, promotoresRes, modulosRes, alertasRes] = await Promise.all([
          fetchMe(),
          fetchMeses(),
          fetchPromotores(),
          fetchModulos(),
          fetchAlertas(),
        ]);
        setUser(meRes);
        setMeses(mesesRes.meses);
        setPromotores(promotoresRes);
        setModulos(modulosRes);
        setAlertas(alertasRes);
        const initialMonth = mesesRes.meses.includes(mesesRes.actual)
          ? mesesRes.actual
          : mesesRes.meses[mesesRes.meses.length - 1];
        setCurrentMonth(initialMonth);
        setDashboard(await fetchDashboard(initialMonth));
      } catch (err) {
        reportError(err);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function refreshDashboard(mes = currentMonth) {
    if (!mes) return;
    try {
      setDashboard(await fetchDashboard(mes));
    } catch (err) {
      reportError(err);
    }
  }

  async function refreshAlertas() {
    try {
      setAlertas(await fetchAlertas());
    } catch (err) {
      reportError(err);
    }
  }

  async function goToMonth(mes: string) {
    setCurrentMonth(mes);
    try {
      setDashboard(await fetchDashboard(mes));
    } catch (err) {
      reportError(err);
    }
  }

  const monthIdx = currentMonth ? meses.indexOf(currentMonth) : -1;

  async function handleAddPromotor() {
    try {
      const created = await createPromotor({ nombre: '', fechaIngreso: todayISO() });
      setPromotores((prev) => [...prev, created]);
      flashSaved();
      await refreshDashboard();
    } catch (err) {
      reportError(err);
    }
  }

  async function handleFieldChange(id: string, field: string, value: string | boolean) {
    setPromotores((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    try {
      await updatePromotor(id, { [field]: value } as Partial<Promotor>);
      flashSaved();
      await Promise.all([refreshDashboard(), refreshAlertas()]);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleMaterialToggle(
    promotorId: string,
    materialId: string,
    entregado: boolean
  ): Promise<MaterialEstado[]> {
    try {
      const estado = await updatePromotorMaterial(promotorId, materialId, entregado);
      const entregados = estado.filter((m) => m.entregado).length;
      setPromotores((prev) =>
        prev.map((p) => (p.id === promotorId ? { ...p, materialesEntregados: entregados } : p))
      );
      flashSaved();
      await Promise.all([refreshDashboard(), refreshAlertas()]);
      return estado;
    } catch (err) {
      reportError(err);
      throw err;
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este promotor del padrón?')) return;
    try {
      await deletePromotor(id);
      setPromotores((prev) => prev.filter((p) => p.id !== id));
      flashSaved();
      await Promise.all([refreshDashboard(), refreshAlertas()]);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleModuloToggle(key: keyof Omit<Modulos, 'comprometidos'>, value: boolean) {
    setModulos((prev) => (prev ? { ...prev, [key]: value } : prev));
    try {
      await updateModulos({ [key]: value });
      flashSaved();
      await refreshDashboard();
    } catch (err) {
      reportError(err);
    }
  }

  async function handleComprometidosChange(value: number) {
    setModulos((prev) => (prev ? { ...prev, comprometidos: value } : prev));
    try {
      await updateModulos({ comprometidos: value });
      flashSaved();
      await refreshDashboard();
    } catch (err) {
      reportError(err);
    }
  }

  async function handleCerrarMes() {
    if (!currentMonth) return;
    if (
      !window.confirm(
        `¿Cerrar ${labelForMonth(currentMonth)}? El resultado quedará fijo aunque el padrón se siga editando después.`
      )
    )
      return;
    try {
      const closed = await cerrarMes(currentMonth);
      setDashboard(closed);
      flashSaved();
    } catch (err) {
      reportError(err);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  if (!ready || !dashboard || !modulos || !currentMonth) {
    return (
      <div className="wrap">
        <TopBar user={user} onLogout={handleLogout} />
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <TopBar user={user} onLogout={handleLogout} />

      <AlertBanner alertas={alertas} />

      <header>
        <div>
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1>Ciclo de vida del promotor</h1>
        </div>
        <div className="header-right">
          <div className="month-bar">
            <button disabled={monthIdx <= 0} onClick={() => goToMonth(meses[monthIdx - 1])}>
              ←
            </button>
            <select value={currentMonth} onChange={(e) => goToMonth(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {labelForMonth(m)}
                </option>
              ))}
            </select>
            <button disabled={monthIdx === -1 || monthIdx >= meses.length - 1} onClick={() => goToMonth(meses[monthIdx + 1])}>
              →
            </button>
          </div>
          <ScoreRing score={dashboard.okrTotal.score} />
        </div>
      </header>

      <div className="close-month-bar">
        {dashboard.closed ? (
          <span className="closed-badge">Mes cerrado · resultado fijo</span>
        ) : (
          <button className="close-month-btn" onClick={handleCerrarMes}>
            Cerrar mes
          </button>
        )}
      </div>

      <Pipeline stages={dashboard.pipeline} />

      <div className="roster">
        <div className="roster-head">
          <p className="section-title" style={{ margin: 0 }}>
            Padrón de promotores
          </p>
          <div className="roster-head-actions">
            <a className="add-row" href="/importar-aspel">
              ⇪ Importar Aspel
            </a>
            <button className="add-row" onClick={handleAddPromotor}>
              + Agregar promotor
            </button>
          </div>
        </div>
        <p className="roster-hint">
          Agrega a cada persona una sola vez, el día que ingresa. Marca las casillas conforme van pasando las cosas — el
          mes o bimestre en que cuenta para cada KPI se calcula solo, a partir de su fecha de ingreso.
        </p>
        <RosterTable
          promotores={promotores}
          onFieldChange={handleFieldChange}
          onDelete={handleDelete}
          onMaterialToggle={handleMaterialToggle}
        />
      </div>

      <Lane
        owner="mesa"
        tag="MESA DE CONTROL"
        emoji="🪪"
        title="Kit administrativo entregado a tiempo"
        weightLabel="Peso 57% · Mensual"
        score={dashboard.kr1.score}
      >
        <KpiRow
          emoji="🪪"
          name="% con carta de acceso y credencial antes del día 1"
          formula="Nuevos ingresos del mes con carta y credencial ÷ nuevos ingresos del mes"
          kpi={dashboard.kr1.carta}
        />
        <KpiRow
          emoji="💻"
          name="% con usuario creado en Emetrix antes del día 1"
          formula="Nuevos ingresos con usuario Emetrix ÷ nuevos ingresos del mes"
          kpi={dashboard.kr1.usuario}
        />
        <KpiRow
          emoji="📝"
          name="% con contrato firmado antes del día 1"
          formula="Nuevos ingresos con contrato firmado ÷ nuevos ingresos del mes"
          kpi={dashboard.kr1.contrato}
        />
        <KpiRow
          emoji="🩺"
          name="% con alta ante el IMSS antes del día 1"
          formula="Nuevos ingresos con alta IMSS ÷ nuevos ingresos del mes"
          kpi={dashboard.kr1.imss}
        />
      </Lane>

      <Lane
        owner="ops"
        tag="OPERACIONES"
        emoji="🎒"
        title="Materiales de campo entregados en calendario"
        weightLabel="Peso 14% · Bimestral"
        score={dashboard.kr2.score}
      >
        <KpiRow
          emoji="🎒"
          name="% con materiales entregados dentro del calendario comprometido"
          formula="Ventanas vencidas este periodo = promotores que cumplen 2 meses de ingreso en el mes seleccionado"
          kpi={dashboard.kr2.materiales}
        />
        <MaterialesResumen />
      </Lane>

      <Lane
        owner="cap"
        tag="CAPACITACIÓN"
        emoji="📚"
        title="Capacitación en módulos"
        weightLabel="Peso 29% · Mensual"
        score={dashboard.kr3.score}
      >
        <ModuleToggles
          modulos={modulos}
          onToggle={handleModuloToggle}
          onComprometidosChange={handleComprometidosChange}
        />
        <KpiRow
          emoji="📚"
          name="% de módulos publicados y vigentes en Emetrix"
          formula="Módulos publicados ÷ módulos comprometidos a la fecha"
          kpi={dashboard.kr3.modulos}
        />
        <KpiRow
          emoji="🎓"
          name="% de promotores con el módulo que les toca por antigüedad completado"
          formula="Completaron su módulo ÷ promotores que cumplieron esa antigüedad este mes"
          kpi={dashboard.kr3.completado}
        />
      </Lane>

      {error && (
        <div className="save-status show" style={{ right: 'auto', left: 24, borderColor: 'var(--bad)', color: 'var(--bad)' }}>
          {error}
        </div>
      )}
      <div className={`save-status${saveStatus ? ' show' : ''}`}>Guardado</div>
    </div>
  );
}
