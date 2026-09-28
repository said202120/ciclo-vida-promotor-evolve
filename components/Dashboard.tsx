'use client';

import { useEffect, useState } from 'react';
import type {
  AlertaActiva,
  CapacitacionModulo,
  CapacitacionResultado,
  Dashboard as DashboardData,
  MaterialEstado,
  Promotor,
  SupervisorConMarca,
} from '@/lib/types';
import {
  createPromotor,
  deletePromotor,
  fetchAlertas,
  fetchCapacitacionModulosBasico,
  fetchCapacitacionResultados,
  fetchDashboard,
  fetchMeses,
  fetchPromotores,
  fetchSupervisoresConMarca,
  updatePromotor,
  updatePromotorMaterial,
} from '@/lib/api-client';
import SiteHeader from './SiteHeader';
import Pipeline from './Pipeline';
import RosterTable from './RosterTable';
import AlertBanner from './AlertBanner';
import RecordatoriosMateriales from './RecordatoriosMateriales';
import MaterialesResumen from './MaterialesResumen';
import ComparacionIngresos from './ComparacionIngresos';
import VisibilidadMaterialesCard from './VisibilidadMaterialesCard';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function labelForMonth(key: string) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

export default function Dashboard() {
  const [meses, setMeses] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [promotores, setPromotores] = useState<Promotor[]>([]);
  const [supervisores, setSupervisores] = useState<SupervisorConMarca[]>([]);
  const [capacitacionModulos, setCapacitacionModulos] = useState<CapacitacionModulo[]>([]);
  const [capacitacionResultados, setCapacitacionResultados] = useState<Array<{ promotorId: string } & CapacitacionResultado>>(
    []
  );
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
        const [mesesRes, promotoresRes, alertasRes, supervisoresRes, capModulosRes, capResultadosRes] = await Promise.all([
          fetchMeses(),
          fetchPromotores(),
          fetchAlertas(),
          fetchSupervisoresConMarca(),
          fetchCapacitacionModulosBasico(),
          fetchCapacitacionResultados(),
        ]);
        setMeses(mesesRes.meses);
        setPromotores(promotoresRes);
        setAlertas(alertasRes);
        setSupervisores(supervisoresRes);
        setCapacitacionModulos(capModulosRes);
        setCapacitacionResultados(capResultadosRes);
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

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

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

  async function handleFieldChange(id: string, field: string, value: string | boolean | null) {
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

  if (!ready || !dashboard || !currentMonth) {
    return (
      <div className="wrap">
        <SiteHeader />
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <SiteHeader />

      <AlertBanner alertas={alertas} />
      <RecordatoriosMateriales />

      <header>
        <div>
          <p className="eyebrow">Administración · Evolve</p>
          <h1>Padrón de promotores</h1>
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
        </div>
      </header>

      <p className="roster-hint" style={{ marginTop: -10, marginBottom: 20 }}>
        Herramienta interna de administración. No afecta el resultado del OKR — el resultado oficial es el de "Ciclo
        de vida del promotor" en la pantalla principal.
      </p>

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
          supervisores={supervisores}
          capacitacionModulos={capacitacionModulos}
          capacitacionResultados={capacitacionResultados}
          onFieldChange={handleFieldChange}
          onDelete={handleDelete}
          onMaterialToggle={handleMaterialToggle}
        />
      </div>

      <VisibilidadMaterialesCard kpi={dashboard.visibilidadMateriales} />

      <MaterialesResumen />

      <ComparacionIngresos />

      {error && (
        <div className="save-status show" style={{ right: 'auto', left: 24, borderColor: 'var(--bad)', color: 'var(--bad)' }}>
          {error}
        </div>
      )}
      <div className={`save-status${saveStatus ? ' show' : ''}`}>Guardado</div>
    </div>
  );
}
