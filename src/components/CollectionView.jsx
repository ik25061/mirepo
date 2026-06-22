import { ArrowLeft, Play } from 'lucide-react';
import Cover from './Cover.jsx';
import SongRow from './SongRow.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';

export default function CollectionView({ collection, onBack, onLike }) {
  const { play } = usePlayer();
  const { kind, name, songs } = collection;
  const round = kind === 'Artista';
  const totalSec = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const coverId = songs.find((s) => s.hasCover)?.id || songs[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        <Cover
          song={{ coverId, hasCover: true }}
          rounded={round ? 'rounded-full' : 'rounded-2xl'}
          className="h-44 w-44 shrink-0 shadow-2xl"
        />
        <div className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kind}</p>
          <h1 className="mt-1 font-display text-4xl font-700 tracking-tight text-balance">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            {formatTime(totalSec)}
          </p>
          <button
            onClick={() => songs.length && play(songs[0], songs)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
          >
            <Play size={18} fill="currentColor" /> Reproducir
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-surface/50 p-2">
        {songs.map((song, i) => (
          <SongRow
            key={song.id}
            song={song}
            index={i}
            queue={songs}
            onLike={onLike}
            showCover={!round}
          />
        ))}
      </div>
    </div>
  );
}