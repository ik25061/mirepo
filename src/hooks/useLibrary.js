import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function useLibrary() {
  const [songs, setSongs] = useState([]);
  const [counts, setCounts] = useState({ total: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getLibrary();
      setSongs(data.songs || []);
      setCounts(data.counts || { total: 0, trash: 0 });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const rescan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.rescan();
      setSongs(data.songs || []);
      setCounts(data.counts || { total: 0, trash: 0 });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
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

  // ====== ELIMINAR CANCIÓN (con confirmación y actualización optimista) ======
  const removeSong = useCallback(async (song) => {
    try {
      // Actualización optimista: eliminar de la lista
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      setCounts((c) => ({ 
        ...c, 
        trash: c.trash + 1, 
        total: Math.max(0, c.total - 1) 
      }));

      // Llamar al backend con el filename correcto
      await api.deleteSong(song.id);
      
      console.log(`✅ Canción "${song.title}" eliminada correctamente`);
    } catch (error) {
      console.error('Error al eliminar:', error);
      // Revertir cambios si falla
      await load();
      alert('❌ Error al eliminar la canción');
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
  };
}