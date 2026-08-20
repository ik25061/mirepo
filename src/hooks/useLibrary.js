/**
 * ============================================================
 * USE LIBRARY - HOOK PARA GESTIONAR LA BIBLIOTECA
 * ============================================================
 * 
 * Implementa scroll infinito con shuffle diario y cursor
 * para evitar repeticiones hasta agotar el catálogo.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api.js';

// HOOK PRINCIPAL
export function useLibrary(onToggleLiked, onRemoveSong, { enabled = true } = {}) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const userId = user?.id;

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
    const [shuffleSeed, setShuffleSeed] = useState(null);
  // Estado de progreso del rescan (alimentado por el SSE /api/rescan-stream).
  const [rescanState, setRescanState] = useState({
    active: false,
    phase: 'idle',
    message: '',
    pct: 0,
    processed: 0,
    total: 0,
  });
  
  // ============================================================
  // REFERENCIAS
  // ============================================================
  const initialLoadDoneRef = useRef(false);
  const prevUserIdRef = useRef(userId);
  const PAGE_SIZE = 100;

  // ============================================================
  // GENERAR SEMILLA DIARIA
  // ============================================================
  const getDailySeed = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const base = `${userId || 'anon'}-${today}`;
    let seed = 0;
    for (let i = 0; i < base.length; i++) {
      seed = ((seed << 5) - seed) + base.charCodeAt(i);
      seed = seed & seed;
    }
    return Math.abs(seed) || 1;
  }, [userId]);

  // ============================================================
  // CARGA INICIAL
  // ============================================================
  const loadInitial = useCallback(async (force = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (initialLoadDoneRef.current && !force) {
      console.log('[useLibrary] 📚 Carga inicial ya hecha');
      return;
    }
    
    if (!userId) {
      console.log('[useLibrary] ⏳ userId no disponible, esperando...');
      setLoading(false);
      return;
    }
    
    try {
      console.log('[useLibrary] 📥 Carga inicial...');
      setLoading(true);
      
      const seed = getDailySeed();
      setShuffleSeed(seed);
      
      const data = await api.getLibrary({ 
        limit: PAGE_SIZE, 
        offset: 0, 
        userId,
        shuffleSeed: seed
      });
      
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
  }, [userId, enabled, getDailySeed]);

  // ============================================================
  // CARGA DE MÁS CANCIONES (SCROLL INFINITO)
  // ============================================================
  const loadMore = useCallback(async () => {
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
      const seed = shuffleSeed || getDailySeed();
      
      const data = await api.getLibrary({ 
        limit: PAGE_SIZE, 
        offset, 
        userId,
        shuffleSeed: seed
      });
      
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : offset + incoming.length;
      const paging = data.pagination || { offset, limit: incoming.length, total };

      if (incoming.length === 0) {
        console.log('[useLibrary] ⚠️ No llegaron canciones nuevas');
        setHasMore(false);
        setIsLoadingMore(false);
        return;
      }

      // Agregar nuevas canciones (no reemplazar)
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
  }, [isLoadingMore, loading, hasMore, error, page, userId, shuffleSeed, getDailySeed]);

    // ============================================================
  // RESCANEAR BIBLIOTECA
  // ============================================================
  const rescan = useCallback(async () => {
    setLoading(true);
    initialLoadDoneRef.current = false;
    setSongs([]);
    setPage(1);
    setIsLoadingMore(false);
    setRescanState((prev) => ({
      ...prev,
      active: true,
      phase: 'start',
      message: 'Iniciando rescan...',
      pct: 0,
      processed: 0,
      total: 0,
    }));

    // Abrir el stream SSE ANTES de disparar el POST: el POST es bloqueante, pero
    // el server escribe el avance real en un archivo JSON que este stream
    // reenvía como eventos de progreso.
    const streamUrl = api.rescanStreamUrl();
    const eventSource = (typeof window !== 'undefined' && streamUrl)
      ? new EventSource(streamUrl)
      : null;
    let sseClosed = false;
    const closeSSE = () => {
      if (eventSource && !sseClosed) {
        sseClosed = true;
        try { eventSource.close(); } catch {}
      }
    };

    if (eventSource) {
      eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'progress' && msg.phase !== 'idle') {
            if (msg.phase === 'done') return; // 'done' se envía como tipo completo
            setRescanState((prev) => ({
              ...prev,
              active: true,
              phase: msg.phase || 'scanning',
              message: msg.message || 'Rescaneando la biblioteca...',
              pct: typeof msg.pct === 'number'
                ? msg.pct
                : (msg.total ? Math.round((msg.processed / msg.total) * 100) : prev.pct),
              processed: msg.processed ?? prev.processed,
              total: msg.total ?? prev.total,
            }));
          } else if (msg.type === 'done') {
            closeSSE();
          }
        } catch (err) {
          console.error('[useLibrary] Error parseando evento SSE de rescan:', err);
        }
      };
      eventSource.onerror = () => {
        // La conexión SSE puede cerrarse al terminar el rescan: no es un error
        // fatídico. Si el POST sigue en vuelo, dejamos que avise el resultado.
      };
    }

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
      setRescanState((prev) => ({ ...prev, active: false, phase: 'done', message: `Rescan completado (${total} canciones)`, pct: 100 }));
    } catch (err) {
      setError(err.message);
      setRescanState((prev) => ({ ...prev, active: false, phase: 'error', message: err.message, pct: 100 }));
    } finally {
      setLoading(false);
      closeSSE();
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
    loadInitial(true);
  }, [loadInitial]);

  // ============================================================
  // CARGA INICIAL - CUANDO CAMBIA userId
  // ============================================================
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    console.log('[useLibrary] 🔄 useEffect - userId:', userId);
    if (prevUserIdRef.current !== userId) {
      initialLoadDoneRef.current = false;
      prevUserIdRef.current = userId;
    }
    loadInitial();
  }, [loadInitial, enabled]);

  // ============================================================
  // TOGGLE LIKE
  // ============================================================
  const toggleLike = useCallback(async (songOrId) => {
    const songId = typeof songOrId === 'string' ? songOrId : songOrId.id;
    const fallbackLiked = typeof songOrId === 'object' && typeof songOrId.liked === 'boolean'
      ? songOrId.liked
      : false;
    const existingSong = songs.find((s) => s.id === songId);
    const newLiked = !(existingSong ? existingSong.liked : fallbackLiked);

    setSongs((prev) => {
      return prev.map((s) => (s.id === songId ? { ...s, liked: newLiked } : s));
    });
    
    onToggleLiked?.(songId, newLiked);
    
    try {
      await api.like(songId, newLiked, userId);
    } catch {
      setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, liked: !newLiked } : s)));
      onToggleLiked?.(songId, !newLiked);
    }
  }, [songs, userId, onToggleLiked]);

  // ============================================================
  // DISLIKE CANCIÓN
  // ============================================================
  const dislikeSong = useCallback(async (song) => {
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
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
    rescanState,
    toggleLike,
    dislikeSong,
    dislikeArtist,
    removeSong,
  };
}