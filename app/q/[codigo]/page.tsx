import { fetchCapacitacionPublicaPorCodigo } from '@/lib/capacitaciones';
import CapacitacionForm from '@/components/CapacitacionForm';

export default async function CapacitacionPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const capacitacion = await fetchCapacitacionPublicaPorCodigo(codigo);

  if (!capacitacion) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p className="eyebrow">OKR · Operaciones · Evolve</p>
          <h1 className="login-title">Link no válido</h1>
          <p>Este link ya no está disponible. Pide uno nuevo a tu ejecutivo.</p>
        </div>
      </div>
    );
  }

  return <CapacitacionForm codigo={codigo} inicial={capacitacion} />;
}
