'use client';

import { useEffect, useState } from 'react';
import type { ComparacionCampo, ComparacionIngreso } from '@/lib/types';
import { fetchComparacionIngresos } from '@/lib/api-client';

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

function CampoComparado({ campo }: { campo: ComparacionCampo }) {
  const sinRespuesta = campo.promotor === null;
  const discrepa = !sinRespuesta && campo.sistema !== campo.promotor;
  return (
    <div className={`comparacion-campo${discrepa ? ' discrepa' : ''}`}>
      <div className="comparacion-fila">
        <span className="comparacion-etq">Sistema</span>
        <span className={`pill ${campo.sistema ? 'good' : 'na'}`}>{campo.sistema ? 'Sí' : 'No'}</span>
      </div>
      <div className="comparacion-fila">
        <span className="comparacion-etq">Promotor</span>
        {sinRespuesta ? (
          <span className="muted">—</span>
        ) : (
          <span className={`pill ${campo.promotor ? 'good' : 'na'}`}>{campo.promotor ? 'Sí' : 'No'}</span>
        )}
      </div>
      {discrepa && <span className="comparacion-alerta">⚠️ no coincide</span>}
    </div>
  );
}

export default function ComparacionIngresos() {
  const [mes, setMes] = useState(currentMonthKey());
  const [datos, setDatos] = useState<ComparacionIngreso[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setError(null);
    fetchComparacionIngresos(mes)
      .then(setDatos)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la comparación.'));
  }, [mes]);

  return (
    <div className="roster">
      <div className="roster-head">
        <p className="section-title" style={{ margin: 0 }}>
          Sistema vs. promotor · nuevos ingresos
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
        Arriba: lo que el sistema tiene registrado (padrón / Mesa de Control / Nómina / Aspel). Abajo: lo que el
        promotor contestó en su encuesta de verificación. ⚠️ marca cuando no coinciden.
      </p>

      {error && <p className="login-error">{error}</p>}

      {!datos ? (
        <p className="resumen-status">Cargando…</p>
      ) : datos.length === 0 ? (
        <div className="empty-roster">
          <div className="empty-icon">🧭</div>
          Sin nuevos ingresos en {labelForMonth(mes)}.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="roster-table">
            <thead>
              <tr>
                <th>Promotor</th>
                <th>Encuesta</th>
                <th>Contrato</th>
                <th>IMSS</th>
                <th>Carta</th>
                <th>Usuario Emetrix</th>
                <th>Credencial</th>
                <th>Fecha materiales avisada</th>
                <th>Materiales</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((c) => {
                const materialesSistema = c.materiales.filter((m) => m.sistema).length;
                const materialesPromotor = c.materiales.filter((m) => m.promotor).length;
                const materialesDiscrepantes = c.materiales.filter(
                  (m) => m.promotor !== null && m.promotor !== m.sistema
                );
                return (
                  <tr key={c.promotorId}>
                    <td style={{ textAlign: 'left' }}>{c.nombre}</td>
                    <td>
                      {c.respondioEncuesta ? (
                        <span className="pill good">Contestada</span>
                      ) : (
                        <span className="pill na">Sin contestar</span>
                      )}
                    </td>
                    <td>
                      <CampoComparado campo={c.contrato} />
                    </td>
                    <td>
                      <CampoComparado campo={c.imss} />
                    </td>
                    <td>
                      <CampoComparado campo={c.carta} />
                    </td>
                    <td>
                      <CampoComparado campo={c.usuarioEmetrix} />
                    </td>
                    <td>
                      {c.credencial.promotor === null ? (
                        <span className="muted">sin respuesta</span>
                      ) : (
                        <span className={`pill ${c.credencial.promotor ? 'good' : 'na'}`}>
                          {c.credencial.promotor ? 'Sí' : 'No'}
                        </span>
                      )}
                    </td>
                    <td>
                      {c.fechaEntregaComunicada.promotor === null ? (
                        <span className="muted">sin respuesta</span>
                      ) : (
                        <span className={`pill ${c.fechaEntregaComunicada.promotor ? 'good' : 'na'}`}>
                          {c.fechaEntregaComunicada.promotor ? 'Sí' : 'No'}
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11.5, textAlign: 'left' }}>
                      {c.respondioEncuesta ? (
                        <>
                          <div>
                            Sistema: {materialesSistema}/{c.materiales.length}
                          </div>
                          <div>
                            Promotor: {materialesPromotor}/{c.materiales.length}
                          </div>
                          {materialesDiscrepantes.length > 0 && (
                            <div className="comparacion-alerta">
                              ⚠️ {materialesDiscrepantes.map((m) => m.nombre).join(', ')}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
