'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Usuario } from '@/lib/types';
import { fetchMe, logout } from '@/lib/api-client';
import { puedeVerAdminCompleta, puedeVerAdministracion } from '@/lib/admin-permisos';
import ChangePasswordButton from './ChangePasswordButton';

/**
 * Menú simple para todos los roles: "Ciclo de vida del promotor" (la
 * pantalla principal, "/"), Cambiar contraseña y Cerrar sesión. El menú
 * "Administración" (Padrón, Usuarios, Marcas, Exámenes) solo aparece si
 * puedeVerAdministracion(usuario) — ver lib/admin-permisos.ts. Un mismo
 * componente en todas las pantallas autenticadas, para que el menú sea
 * idéntico en cualquier lugar del portal.
 */
export default function SiteHeader() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMe()
      .then(setUsuario)
      .catch(() => setUsuario(null));
  }, []);

  useEffect(() => {
    if (!adminOpen) return;
    function onDocClick(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) setAdminOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAdminOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [adminOpen]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  const mostrarAdmin = !!usuario && puedeVerAdministracion(usuario);
  const mostrarAdminCompleta = !!usuario && puedeVerAdminCompleta(usuario);

  return (
    <div className="topbar">
      <div className="topbar-user">
        {usuario && (
          <>
            <a className="topbar-link" href="/">
              Ciclo de vida del promotor
            </a>
            {mostrarAdmin && (
              <div className="admin-menu-cell" ref={adminRef}>
                <button type="button" className="topbar-link" onClick={() => setAdminOpen((o) => !o)}>
                  Administración ▾
                </button>
                {adminOpen && (
                  <div className="admin-menu-popover" role="menu">
                    <a href="/padron" role="menuitem">
                      Padrón
                    </a>
                    {mostrarAdminCompleta && (
                      <>
                        <a href="/usuarios" role="menuitem">
                          Usuarios
                        </a>
                        <a href="/marcas" role="menuitem">
                          Marcas
                        </a>
                        <a href="/capacitaciones" role="menuitem">
                          Exámenes
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            <ChangePasswordButton />
            <button type="button" className="topbar-link" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </>
        )}
      </div>
      <Image src="/logo_pag-1.png" alt="Evolve" width={136} height={42} priority className="topbar-logo" />
    </div>
  );
}
