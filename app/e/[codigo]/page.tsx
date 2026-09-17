import { fetchEncuestaPorCodigo } from '@/lib/encuestas';
import EncuestaForm from '@/components/EncuestaForm';

export default async function EncuestaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const encuesta = await fetchEncuestaPorCodigo(codigo);

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

  return <EncuestaForm codigo={codigo} inicial={encuesta} />;
}
