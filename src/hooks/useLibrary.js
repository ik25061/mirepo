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

// HOOK PRINCIPAL
// ============================================================
export function useLibrary(userId, onToggleLiked, onRemoveSong) {

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
  const prevUserIdRef = useRef(userId);
  const PAGE_SIZE = 100;

  // ============================================================
  // CARGA INICIAL
  // ============================================================
  const loadInitial = useCallback(async (force = false) => {
    if (initialLoadDoneRef.current && !force) {
      console.log('[useLibrary] 📚 Carga inicial ya hecha');
      return;
    }
    
    if (!userId) {
      console.log('[useLibrary] ⏳ userId no disponible, esperando...');
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

      setSongs(incoming);
      setCounts({ 
        total, 
        trash: typeof data.counts?.trash === 'number' ? data.counts.trash : 0 
      });
      setError(null);
      setHasMore(paging.offset + paging.limit < paging.total);
      setPage(1);
      initialLoadDoneRef.current = true;
      
      console.log('[useLibrary] ✅ Carga inicial completada, canciones:', incoming.length);
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
      setSongs(prev => {
        const combined = [...prev, ...incoming];
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
      setSongs(incoming);
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
  // CARGA INICIAL - CUANDO CAMBIA userId
  // ============================================================
  useEffect(() => {
    console.log('[useLibrary] 🔄 useEffect - userId:', userId);
    // Si userId cambió, forzar recarga
    if (prevUserIdRef.current !== userId) {
      initialLoadDoneRef.current = false;
      prevUserIdRef.current = userId;
    }
    loadInitial();
  }, [loadInitial]);

  // ============================================================

  // ============================================================
  // TOGGLE LIKE - INDEPENDIENTE DE SI LA CANCIÓN ESTÁ EN LA LISTA
  // ============================================================
  const toggleLike = useCallback(async (songOrId) => {
    const songId = typeof songOrId === 'string' ? songOrId : songOrId.id;
    const fallbackLiked = typeof songOrId === 'object' && typeof songOrId.liked === 'boolean'
      ? songOrId.liked
      : false;
    const existingSong = songs.find((s) => s.id === songId);
    const newLiked = !(existingSong ? existingSong.liked : fallbackLiked);

    // Actualizar en songs (las 100 cargadas)
    setSongs((prev) => {
      return prev.map((s) => (s.id === songId ? { ...s, liked: newLiked } : s));
    });
    
    // Notificar a allSongs para que también actualice su estado
    onToggleLiked?.(songId, newLiked);
    
    try {
      await api.like(songId, newLiked, userId);
    } catch {
      setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, liked: !newLiked } : s)));
      // Revertir en allSongs también
      onToggleLiked?.(songId, !newLiked);
    }
  }, [songs, userId, onToggleLiked]);

  // ============================================================
  // DISLIKE CANCIÓN
  // ============================================================
  const dislikeSong = useCallback(async (song) => {
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    // Notificar a allSongs para remover la canción
    onRemoveSong?.(song.id);
    await api.hideSong(song.id, userId);
  }, [userId, onRemoveSong]);


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