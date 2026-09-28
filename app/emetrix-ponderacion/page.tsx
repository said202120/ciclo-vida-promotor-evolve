import { redirect } from 'next/navigation';

// "Ciclo de vida del promotor" vive ahora en "/" — esta ruta se conserva
// como redirección permanente por si alguien tiene el enlace guardado.
export default function EmetrixPonderacionPage() {
  redirect('/');
}
