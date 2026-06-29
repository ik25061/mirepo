import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function useLibrary() {
  const [songs, setSongs] = useState([]);
  const [counts, setCounts] = useState({ total: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async ({ limit, offset } = {}) => {
    try {
      const data = await api.getLibrary({ limit, offset });
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : incoming.length;
      const paging = data.pagination || { offset: 0, limit: incoming.length, total };

      setSongs((prev) => (typeof offset === 'number' && offset > 0 ? [...prev, ...incoming] : incoming));
      setCounts({ total, trash: typeof data.counts?.trash === 'number' ? data.counts.trash : 0 });
      setError(null);
      setHasMore(paging.offset + paging.limit < paging.total);
      return data;
    } catch (err) {
      setError(err.message);
      setHasMore(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || error || !hasMore) return;
    setLoading(true);
    try {
      const data = await api.getLibrary({ limit: 100, offset: songs.length });
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : songs.length + incoming.length;
      const paging = data.pagination || { offset: songs.length, limit: incoming.length, total };

      setSongs((prev) => [...prev, ...incoming]);
      setCounts((prev) => ({ ...prev, total }));
      setHasMore(paging.offset + paging.limit < paging.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading, error, hasMore, songs.length]);

  const rescan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.rescan();
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : incoming.length;
      setSongs(incoming);
      setCounts({ total, trash: typeof data.counts?.trash === 'number' ? data.counts.trash : 0 });
      setError(null);
      const paging = data.pagination || { offset: 0, limit: incoming.length, total };
      setHasMore(paging.offset + paging.limit < paging.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ limit: 100 });
  }, [load]);

  const toggleLike = useCallback(async (song) => {
    const liked = !song.liked;
    setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, liked } : s)));
    try {
      await api.like(song.id, liked);
    } catch {
      setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, liked: !liked } : s)));
    }
  }, []);

  const dislikeSong = useCallback(async (song) => {
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    await api.hideSong(song.id);
  }, []);

  const dislikeArtist = useCallback(async (artist) => {
    setSongs((prev) => prev.filter((s) => s.artist !== artist));
    await api.hideArtist(artist);
  }, []);

  const removeSong = useCallback(async (song) => {
    try {
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      setCounts((c) => ({
        ...c,
        trash: c.trash + 1,
        total: Math.max(0, c.total - 1),
      }));
      await api.deleteSong(song.id);
      console.log(`✅ Canción "${song.title}" eliminada correctamente`);
      return true;
    } catch (error) {
      console.error('Error al eliminar:', error);
      await load({ limit: 100 });
      alert('❌ Error al eliminar la canción');
      return false;
    }
  }, [load]);

  return {
    songs,
    counts,
    loading,
    error,
    reload: load,
    rescan,
    toggleLike,
    dislikeSong,
    dislikeArtist,
    removeSong,
    loadMore,
    hasMore,
  };
}