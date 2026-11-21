/**
 * ============================================================
 * USE ALL SONGS - HOOK PARA OBTENER TODAS LAS CANCIONES
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api.js';

export function useAllSongs({ enabled = true } = {}) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const prevUserIdRef = useRef(userId);
  const cacheKey = userId ? `mirepo_lastLibrary:${encodeURIComponent(userId)}` : null;

  const loadAllSongs = useCallback(async (force = false) => {
    if (!enabled) {
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }

    if (loadedRef.current && !force) {
      console.log('[useAllSongs] 📚 Ya cargadas, saltando');
      return;
    }
    
    if (!userId) {
      console.log('[useAllSongs] ⏳ userId no disponible, esperando...');
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }
    
    try {
      setLoading(true);
      console.log('[useAllSongs] 📥 Cargando todas las canciones...');
      // Obtener todas las canciones (sin likedOnly para tener la lista completa con liked)
      const data = await api.getLibrary({ limit: 99999, offset: 0, userId });
      if (mountedRef.current) {
        // Asegurar que las canciones tengan el campo liked correcto
        const songs = (data.songs || []).map(s => ({
          ...s,
          liked: s.liked || false
        }));
        setAllSongs(songs);
        // Guardar caché local para fallback offline
        try {
          if (typeof window !== 'undefined' && songs) {
            if (cacheKey) window.localStorage.setItem(cacheKey, JSON.stringify({ songs, savedAt: Date.now() }));
          }
        } catch (err) {
          console.warn('[useAllSongs] No se pudo guardar caché:', err);
        }
        setError(null);
        loadedRef.current = true;
        console.log('[useAllSongs] ✅ Cargadas:', songs.length, 'canciones');
      }
    } catch (err) {
      console.error('[useAllSongs] ❌ Error:', err);
      // Intentar cargar versión almacenada localmente
      if (mountedRef.current) {
        try {
          const cached = typeof window !== 'undefined' && cacheKey ? window.localStorage.getItem(cacheKey) : null;
          if (cached) {
            const parsed = JSON.parse(cached || 'null');
            const songs = Array.isArray(parsed) ? parsed : (parsed?.songs || []);
            setAllSongs(songs);
            setError(null);
            loadedRef.current = true;
            console.log('[useAllSongs] ⚠️ Usando caché local, canciones:', songs.length);
          } else {
            setError(err.message);
          }
        } catch (e) {
          setError(err.message);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [userId, enabled, cacheKey]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }

    // Si el userId cambió, forzar recarga
    if (prevUserIdRef.current !== userId) {
      loadedRef.current = false;
      prevUserIdRef.current = userId;
    }
    loadAllSongs();
    return () => { mountedRef.current = false; };
  }, [loadAllSongs, enabled]);

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