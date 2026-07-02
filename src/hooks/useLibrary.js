/**
 * ============================================================
 * USE LIBRARY - HOOK PARA GESTIONAR LA BIBLIOTECA
 * ============================================================
 * 
 * Implementa scroll infinito usando IntersectionObserver.
 * Basado en: https://dev.to/franklin030601/creando-un-scroll-infinito-con-react-js-27gf
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '../lib/api.js';

// ============================================================
// FUNCIÓN AUXILIAR: Mezclar array
// ============================================================
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================
// HOOK PRINCIPAL
// ============================================================
export function useLibrary(userId) {
  // ============================================================
  // ESTADO
  // ============================================================
  const [songs, setSongs] = useState([]);
  const [counts, setCounts] = useState({ total: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // ============================================================
  // REFERENCIAS
  // ============================================================
  const initialLoadDoneRef = useRef(false);
  const PAGE_SIZE = 100;

  // ============================================================
  // CARGA INICIAL
  // ============================================================
  const loadInitial = useCallback(async () => {
    if (initialLoadDoneRef.current) {
      console.log('[useLibrary] 📚 Carga inicial ya hecha');
      return;
    }
    
    try {
      console.log('[useLibrary] 📥 Carga inicial...');
      setLoading(true);
      
      const data = await api.getLibrary({ limit: PAGE_SIZE, offset: 0, userId });
      console.log('[useLibrary] 📊 Datos recibidos:', data.songs?.length || 0, 'canciones');
      
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : incoming.length;
      const paging = data.pagination || { offset: 0, limit: incoming.length, total };

      const shuffled = shuffleArray(incoming);
      setSongs(shuffled);
      setCounts({ 
        total, 
        trash: typeof data.counts?.trash === 'number' ? data.counts.trash : 0 
      });
      setError(null);
      setHasMore(paging.offset + paging.limit < paging.total);
      setPage(1);
      initialLoadDoneRef.current = true;
      
      console.log('[useLibrary] ✅ Carga inicial completada, canciones:', shuffled.length);
      console.log('[useLibrary] 📌 hasMore:', paging.offset + paging.limit < paging.total);
      
    } catch (err) {
      console.error('[useLibrary] ❌ Error cargando:', err);
      setError(err.message);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ============================================================
  // CARGA DE MÁS CANCIONES (SCROLL INFINITO)
  // ============================================================
  const loadMore = useCallback(async () => {
    // ============================================================
    // PREVENIR CARGAS MÚLTIPLES
    // ============================================================
    if (isLoadingMore) {
      console.log('[useLibrary] ⏳ Ya cargando más, ignorando...');
      return;
    }
    
    if (loading) {
      console.log('[useLibrary] ⏳ Ya está cargando...');
      return;
    }
    
    if (!hasMore) {
      console.log('[useLibrary] 🚫 No hay más canciones');
      return;
    }
    
    if (error) {
      console.log('[useLibrary] ❌ Error detectado');
      return;
    }
    
    console.log('[useLibrary] 📥 Cargando más canciones, página:', page + 1);
    setIsLoadingMore(true);
    
    try {
      const offset = page * PAGE_SIZE;
      const data = await api.getLibrary({ limit: PAGE_SIZE, offset, userId });
      
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : offset + incoming.length;
      const paging = data.pagination || { offset, limit: incoming.length, total };

      if (incoming.length === 0) {
        console.log('[useLibrary] ⚠️ No llegaron canciones nuevas');
        setHasMore(false);
        setIsLoadingMore(false);
        return;
      }

      // ============================================================
      // AGREGAR NUEVAS CANCIONES (NO REEMPLAZAR)
      // ============================================================
      const shuffledNew = shuffleArray(incoming);
      
      setSongs(prev => {
        const combined = [...prev, ...shuffledNew];
        console.log('[useLibrary] 📊 Total canciones:', combined.length);
        return combined;
      });
      
      setPage(prev => prev + 1);
      setCounts(prev => ({ ...prev, total }));
      setHasMore(paging.offset + paging.limit < paging.total);
      
      console.log('[useLibrary] ✅ Carga completada, hasMore:', paging.offset + paging.limit < paging.total);
      
    } catch (err) {
      console.error('[useLibrary] ❌ Error cargando más:', err);
      setError(err.message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, loading, hasMore, error, page, userId]);

  // ============================================================
  // RESCANEAR BIBLIOTECA
  // ============================================================
  const rescan = useCallback(async () => {
    setLoading(true);
    initialLoadDoneRef.current = false;
    setSongs([]);
    setPage(1);
    setIsLoadingMore(false);
    
    try {
      const data = await api.rescan();
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : incoming.length;
      const shuffled = shuffleArray(incoming);
      setSongs(shuffled);
      setCounts({ 
        total, 
        trash: typeof data.counts?.trash === 'number' ? data.counts.trash : 0 
      });
      setError(null);
      const paging = data.pagination || { offset: 0, limit: incoming.length, total };
      setHasMore(paging.offset + paging.limit < paging.total);
      initialLoadDoneRef.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // RECARGAR
  // ============================================================
  const reload = useCallback(() => {
    initialLoadDoneRef.current = false;
    setSongs([]);
    setPage(1);
    setLoading(true);
    loadInitial();
  }, [loadInitial]);

  // ============================================================
  // CARGA INICIAL - SOLO UNA VEZ
  // ============================================================
  useEffect(() => {
    console.log('[useLibrary] 🔄 useEffect - cargando inicial...');
    loadInitial();
  }, []);

  // ============================================================
  // TOGGLE LIKE
  // ============================================================
  const toggleLike = useCallback(async (songOrId) => {
    const songId = typeof songOrId === 'string' ? songOrId : songOrId.id;
    
    let newLiked;
    setSongs((prev) => {
      const song = prev.find((s) => s.id === songId);
      if (!song) return prev;
      newLiked = !song.liked;
      return prev.map((s) => (s.id === songId ? { ...s, liked: newLiked } : s));
    });
    
    try {
      await api.like(songId, newLiked, userId);
    } catch {
      setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, liked: !newLiked } : s)));
    }
  }, [userId]);

  // ============================================================
  // DISLIKE CANCIÓN
  // ============================================================
  const dislikeSong = useCallback(async (song) => {
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    await api.hideSong(song.id, userId);
  }, [userId]);

  // ============================================================
  // DISLIKE ARTISTA
  // ============================================================
  const dislikeArtist = useCallback(async (artist) => {
    setSongs((prev) => prev.filter((s) => s.artist !== artist));
    await api.hideArtist(artist, userId);
  }, [userId]);

  // ============================================================
  // ELIMINAR CANCIÓN
  // ============================================================
  const removeSong = useCallback(async (song) => {
    try {
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      setCounts((c) => ({
        ...c,
        trash: c.trash + 1,
        total: Math.max(0, c.total - 1),
      }));
      await api.deleteSong(song.id, userId);
      return true;
    } catch (error) {
      console.error('❌ Error al eliminar:', error);
      alert('❌ Error al eliminar la canción');
      return false;
    }
  }, [userId]);

  // ============================================================
  // RETORNAR VALORES
  // ============================================================
  return {
    songs,
    counts,
    loading,
    error,
    hasMore,
    isLoadingMore,
    reload,
    loadMore,
    rescan,
    toggleLike,
    dislikeSong,
    dislikeArtist,
    removeSong,
  };
}