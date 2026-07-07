/**
 * ============================================================
 * USE ALL SONGS - HOOK PARA OBTENER TODAS LAS CANCIONES
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

export function useAllSongs(userId) {
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);

  const loadAllSongs = useCallback(async () => {
    if (loadedRef.current) {
      console.log('[useAllSongs] 📚 Ya cargadas, saltando');
      return;
    }
    
    try {
      setLoading(true);
      console.log('[useAllSongs] 📥 Cargando todas las canciones...');
      const data = await api.getLibrary({ limit: 99999, offset: 0, userId });
      if (mountedRef.current) {
        setAllSongs(data.songs || []);
        setError(null);
        loadedRef.current = true;
        console.log('[useAllSongs] ✅ Cargadas:', data.songs?.length || 0, 'canciones');
      }
    } catch (err) {
      console.error('[useAllSongs] ❌ Error:', err);
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    loadAllSongs();
    return () => { mountedRef.current = false; };
  }, [loadAllSongs]);

  const reload = useCallback(() => {
    loadedRef.current = false;
    loadAllSongs();
  }, [loadAllSongs]);

  return { allSongs, loading, error, reload };
}