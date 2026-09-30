import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, ThumbsDown, Trash2, Undo2 } from 'lucide-react';
import SongRow from './SongRow.jsx';
import { api } from '../lib/api.js';

export default function DislikedSongsView({ userId, onRefresh }) {
  const [tab, setTab] = useState('disliked');
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const offsetRef = useRef(0);

  const loadSongs = useCallback(async (reset = true) => {
    if (!userId) {
      setSongs([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    setError('');
    try {
      const offset = reset ? 0 : offsetRef.current;
      const result = tab === 'disliked'
        ? await api.getHiddenSongs(userId, { limit: 100, offset })
        : await api.getDeferredDeletions(userId, { limit: 100, offset });
      const incoming = result.songs || [];
      offsetRef.current = offset + incoming.length;
      setSongs((previous) => reset ? incoming : [...previous, ...incoming]);
      setHasMore(offsetRef.current < (result.pagination?.total || 0));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las canciones.');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }, [tab, userId]);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  const removeMark = async (song) => {
    try {
      if (tab === 'disliked') await api.hideSong(song.id, userId, false);
      else await api.setDeferredDeletion(song.id, userId, false);
      setSongs((previous) => previous.filter((item) => item.id !== song.id));
      await onRefresh?.();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la canción.');
    }
  };

  const moveToTrash = async (song) => {
    if (!window.confirm(`¿Enviar "${song.title}" y sus archivos asociados a la papelera?`)) return;
    try {
      await api.deleteSong(song.id, userId);
      setSongs((previous) => previous.filter((item) => item.id !== song.id));
    } catch (err) {
      setError(err.message || 'No se pudo enviar la canción a la papelera.');
    }
  };

  const isDeferred = tab === 'deferred';

  return (
    <section className="flex flex-col gap-4 pb-20">
      <header>
        <h1 className="font-display text-2xl font-semibold">Canciones que no me gustan</h1>
        <div className="mt-4 inline-flex max-w-full rounded-md border border-border p-1" role="tablist" aria-label="Listas de canciones">
          <button
            type="button"
            role="tab"
            aria-selected={!isDeferred}
            onClick={() => setTab('disliked')}
            className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm ${!isDeferred ? 'bg-surface-2 text-foreground' : 'text-muted-foreground'}`}
          >
            <ThumbsDown size={16} /> Dislikes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isDeferred}
            onClick={() => setTab('deferred')}
            className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm ${isDeferred ? 'bg-surface-2 text-foreground' : 'text-muted-foreground'}`}
          >
            <Clock3 size={16} /> Por eliminar
          </button>
        </div>
      </header>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando lista...</p>
      ) : songs.length ? (
        <>
          <div className="space-y-1">
            {songs.map((song, index) => (
              <div key={song.id} className="flex min-w-0 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <SongRow song={song} index={index} queue={songs} />
                </div>
                <button
                  type="button"
                  onClick={() => removeMark(song)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title={isDeferred ? 'Quitar marca de eliminación' : 'Quitar de No me gusta'}
                  aria-label={`${isDeferred ? 'Quitar marca de eliminación de' : 'Quitar de No me gusta'} ${song.title}`}
                >
                  <Undo2 size={16} />
                </button>
                {isDeferred && (
                  <button
                    type="button"
                    onClick={() => moveToTrash(song)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    title="Enviar canción y asociados a la papelera"
                    aria-label={`Enviar ${song.title} a la papelera`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => loadSongs(false)}
              disabled={loadingMore}
              className="mx-auto block rounded px-4 py-2 text-sm text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              {loadingMore ? 'Cargando...' : 'Cargar más'}
            </button>
          )}
        </>
      ) : (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {isDeferred ? 'No hay canciones marcadas para eliminar.' : 'No hay canciones marcadas como No me gusta.'}
        </div>
      )}
    </section>
  );
}
