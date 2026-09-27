'use client';

import { useEffect, useState } from 'react';
import type { EmetrixKpiManualBase } from '@/lib/types';

function aTexto(n: number | null): string {
  return n === null ? '' : String(n);
}

function aNumero(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los dos números de un KPI de captura manual con base (sección 4-bis):
 * "18 de 20" en vez de un solo %. Cada input guarda al salir del campo
 * (onBlur), igual que el resto de la captura manual — pero siempre manda LOS
 * DOS números juntos (el que se acaba de editar y el otro tal cual está en
 * pantalla), porque el % solo se puede validar/calcular con ambos a la vez.
 * Estado local controlado para poder leer "el otro campo" al guardar sin
 * tocar el DOM directamente.
 */
export default function EmetrixKpiBaseInputs({
  entrada,
  labelNumerador,
  labelDenominador,
  onGuardar,
  anchoInput = 64,
}: {
  entrada: EmetrixKpiManualBase;
  labelNumerador: string;
  labelDenominador: string;
  onGuardar: (numerador: number | null, denominador: number | null) => void;
  anchoInput?: number;
}) {
  const [numerador, setNumerador] = useState(aTexto(entrada.numerador));
  const [denominador, setDenominador] = useState(aTexto(entrada.denominador));

  useEffect(() => {
    setNumerador(aTexto(entrada.numerador));
    setDenominador(aTexto(entrada.denominador));
  }, [entrada.numerador, entrada.denominador]);

  function guardar(numeradorTexto: string, denominadorTexto: string) {
    onGuardar(aNumero(numeradorTexto), aNumero(denominadorTexto));
  }

  return (
    <div className="emetrix-kpi-base-inputs">
      <label className="emetrix-kpi-base-campo">
        <span className="roster-hint">{labelNumerador}</span>
        <input
          type="number"
          min={0}
          value={numerador}
          onChange={(e) => setNumerador(e.target.value)}
          onBlur={() => guardar(numerador, denominador)}
          style={{ width: anchoInput }}
        />
      </label>
      <label className="emetrix-kpi-base-campo">
        <span className="roster-hint">{labelDenominador}</span>
        <input
          type="number"
          min={0}
          value={denominador}
          onChange={(e) => setDenominador(e.target.value)}
          onBlur={() => guardar(numerador, denominador)}
          style={{ width: anchoInput }}
        />
      </label>
      {entrada.numerador === null && entrada.denominador === null && entrada.legacyPorcentaje !== null && (
        <span className="roster-hint emetrix-kpi-base-legacy">Antes (sin base): {entrada.legacyPorcentaje}%</span>
      )}
    </div>
  );
}
