'use client';

export default function SiNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="encuesta-pregunta">
      <p>{label}</p>
      <div className="encuesta-sino">
        <button type="button" className={value === true ? 'si activo' : 'si'} onClick={() => onChange(true)}>
          Sí
        </button>
        <button type="button" className={value === false ? 'no activo' : 'no'} onClick={() => onChange(false)}>
          No
        </button>
      </div>
    </div>
  );
}
