import { fetchEncuestaMaterialesPorCodigo } from '@/lib/encuestas';
import EncuestaMaterialesForm from '@/components/EncuestaMaterialesForm';

export default async function EncuestaMaterialesPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const encuesta = await fetchEncuestaMaterialesPorCodigo(codigo);

  if (!encuesta) {
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

  return <EncuestaMaterialesForm codigo={codigo} inicial={encuesta} />;
}
