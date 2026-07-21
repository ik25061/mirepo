/**
 * ============================================================
 * USE AUTO DELETE DOWNLOAD - ELIMINAR DESCARGA DESPUÉS DE ESCUCHAR
 * ============================================================
 *
 * Toggle por dispositivo (localStorage). Si está activo y se reproduce
 * una canción descargada, se elimina de las descargas al terminar.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'mirepo_auto_delete_download';

export function useAutoDeleteDownload() {
  const [enabled, setEnabled] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(enabled));
        // Notificar a otras instancias en la misma página
        try {
          window.dispatchEvent(new CustomEvent('mirepo-auto-delete-changed', { detail: { enabled } }));
        } catch {}
      }
    } catch {}
  }, [enabled]);

  // Escuchar cambios desde otras pestañas/ventanas
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        setEnabled(e.newValue === 'true');
      }
    };
    const onCustom = (e) => {
      try {
        if (e?.detail && typeof e.detail.enabled === 'boolean') {
          setEnabled(e.detail.enabled);
        }
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('mirepo-auto-delete-changed', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('mirepo-auto-delete-changed', onCustom);
    };
  }, []);

  const toggle = () => setEnabled((prev) => !prev);

  return { enabled, toggle };
}