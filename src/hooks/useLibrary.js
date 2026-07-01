import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function useLibrary(userId) {
  const [songs, setSongs] = useState([]);
  const [counts, setCounts] = useState({ total: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);

  const load = useCallback(async ({ limit, offset } = {}) => {
    try {
      const data = await api.getLibrary({ limit, offset, userId });
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : incoming.length;
      const paging = data.pagination || { offset: 0, limit: incoming.length, total };

      if (!offset || offset === 0) {
        const shuffled = shuffleArray(incoming);
        setSongs(shuffled);
        setServerOffset(incoming.length);
      } else {
        setSongs((prev) => {
          const combined = [...prev, ...incoming];
          return shuffleArray(combined);
        });
        setServerOffset((prev) => prev + incoming.length);
      }
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
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loading || error || !hasMore) return;
    setLoading(true);
    try {
      const nextOffset = serverOffset;
      const data = await api.getLibrary({ limit: 100, offset: nextOffset, userId });
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : serverOffset + incoming.length;
      const paging = data.pagination || { offset: nextOffset, limit: incoming.length, total };

      setSongs((prev) => {
        const combined = [...prev, ...incoming];
        return shuffleArray(combined);
      });
      setServerOffset((prev) => prev + incoming.length);
      setCounts((prev) => ({ ...prev, total }));
      setHasMore(paging.offset + paging.limit < paging.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading, error, hasMore, serverOffset, userId]);

  const rescan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.rescan();
      const incoming = data.songs || [];
      const total = typeof data.counts?.total === 'number' ? data.counts.total : incoming.length;
      const shuffled = shuffleArray(incoming);
      setSongs(shuffled);
      setServerOffset(incoming.length);
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

  const dislikeSong = useCallback(async (song) => {
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    await api.hideSong(song.id, userId);
  }, [userId]);

  const dislikeArtist = useCallback(async (artist) => {
    setSongs((prev) => prev.filter((s) => s.artist !== artist));
    await api.hideArtist(artist, userId);
  }, [userId]);

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
      console.error('Error al eliminar:', error);
      await load({ limit: 100 });
      alert('❌ Error al eliminar la canción');
      return false;
    }
  }, [load, userId]);

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