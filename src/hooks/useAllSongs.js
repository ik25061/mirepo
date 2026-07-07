/**
 * ============================================================
 * USE ALL SONGS - HOOK PARA OBTENER TODAS LAS CANCIONES
 * ============================================================
 * 
 * Obtiene TODAS las canciones del servidor sin límite,
 * para usar en GridView, CollectionView y NowPlayingScreen.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

export function useAllSongs(userId) {
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const loadAllSongs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getLibrary({ limit: 99999, offset: 0, userId });
      if (mountedRef.current) {
        setAllSongs(data.songs || []);
        setError(null);
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

  return { allSongs, loading, error, reload: loadAllSongs };
}