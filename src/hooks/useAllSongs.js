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
  const prevUserIdRef = useRef(userId);

  // Siempre cargar sin caché para obtener datos actualizados
  const loadAllSongs = useCallback(async (force = false) => {
    if (loadedRef.current && !force) {
      console.log('[useAllSongs] 📚 Ya cargadas, saltando');
      return;
    }
    
    if (!userId) {
      console.log('[useAllSongs] ⏳ userId no disponible, esperando...');
      return;
    }
    
    try {
      setLoading(true);
      console.log('[useAllSongs] 📥 Cargando todas las canciones...');
      // Obtener todas las canciones (sin likedOnly para tener la lista completa con liked)
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
    // Si el userId cambió, forzar recarga
    if (prevUserIdRef.current !== userId) {
      loadedRef.current = false;
      prevUserIdRef.current = userId;
    }
    loadAllSongs();
    return () => { mountedRef.current = false; };
  }, [loadAllSongs]);

  // ============================================================
  // TOGGLE LIKE EN ALLSONGS - ACTUALIZA EL ESTADO LIKED
  // ============================================================
  const toggleLiked = useCallback((songId, liked) => {
    setAllSongs(prev => prev.map(s => s.id === songId ? { ...s, liked } : s));
  }, []);

  // ============================================================
  // REMOVE SONG EN ALLSONGS - ELIMINA UNA CANCIÓN (DISLIKE)
  // ============================================================
  const removeSong = useCallback((songId) => {
    setAllSongs(prev => prev.filter(s => s.id !== songId));
  }, []);

  const reload = useCallback(() => {
    loadedRef.current = false;
    loadAllSongs(true);
  }, [loadAllSongs]);

  return { allSongs, loading, error, reload, toggleLiked, removeSong, loadAllSongs };
}


