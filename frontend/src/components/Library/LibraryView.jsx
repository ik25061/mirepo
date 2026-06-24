import { useMemo, useState } from 'react';
import { Search, Play, Trash2, UserX, Album } from 'lucide-react';
import SongRow from '../SongRow';
import { usePlayer } from '../../context/PlayerContext';

export default function LibraryView({
  songs,
  counts,
  onLike,
  onHideSong,
  onHideArtist,
  onDelete,
}) {
  const { play } = usePlayer();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q),
    );
  }, [songs, query]);

  return (
    <div className="flex flex-col gap-6">
      <header className="animate-fade-in flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-700 tracking-tight text-white">Biblioteca</h1>
          <p className="mt-1 text-sm text-muted-foreground" style={{ color: '#a7a7a7' }}>
            {counts.visible} {counts.visible === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1" style={{ color: '#727272' }}>
              <Trash2 size={13} /> {counts.trash} en papelera
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" style={{ color: '#727272' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en tu biblioteca"
              className="w-48 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary sm:w-64"
              style={{ background: '#282828', borderColor: '#333', color: '#fff' }}
            />
          </div>
          {filtered.length > 0 && (
            <button
              onClick={() => play(filtered[0], filtered)}
              className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow transition hover:scale-105"
              style={{ background: '#1db954' }}
              aria-label="Reproducir todo"
            >
              <Play size={18} fill="currentColor" className="ml-0.5 text-black" />
            </button>
          )}
        </div>
      </header>

      <div className="animate-fade-in rounded-xl border border-border bg-surface/50 p-2" style={{ borderColor: '#282828', background: 'rgba(30,30,30,0.5)' }}>
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground" style={{ color: '#727272' }}>
            {songs.length === 0
              ? 'No hay canciones. Agrega archivos a la carpeta de música.'
              : 'No se encontraron coincidencias.'}
          </p>
        ) : (
          filtered.map((song, i) => (
            <SongRow
              key={song.id}
              song={song}
              index={i}
              queue={filtered}
              onLike={onLike}
              onHide={onHideSong}
              onHideArtist={onHideArtist}
              onDelete={onDelete}
              showDelete
            />
          ))
        )}
      </div>
    </div>
  );
}