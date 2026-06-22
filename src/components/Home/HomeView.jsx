import { Heart, Play } from 'lucide-react';
import Carousel from './Carousel.jsx';
import CollectionCard from './CollectionCard.jsx';
import SongRow from '../SongRow.jsx';
import { buildAlbums, buildArtists, buildGenres } from '../../lib/format.js';
import { usePlayer } from '../../context/PlayerContext.jsx';

export default function HomeView({ songs, onOpenCollection, onLike }) {
  const { play } = usePlayer();
  const liked = songs.filter((s) => s.liked);
  const albums = buildAlbums(songs);
  const artists = buildArtists(songs);
  const genres = buildGenres(songs);

  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="flex flex-col gap-4 pb-24 w-full">
      <header className="animate-fade-in">
        <h1 className="text-xl font-700 tracking-tight text-white sm:text-3xl">{greeting}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">Tu música, sin distracciones.</p>
      </header>

      {/* Canciones que me gustan */}
      <section className="animate-fade-in overflow-hidden rounded-xl border border-border bg-gradient-to-b from-primary/10 to-surface sm:rounded-2xl">
        <div className="flex items-center gap-3 p-3 sm:p-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg sm:h-20 sm:w-20 sm:rounded-xl">
            <Heart size={20} fill="currentColor" className="sm:hidden" />
            <Heart size={36} fill="currentColor" className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">Lista</p>
            <h2 className="text-sm font-700 text-white sm:text-2xl">Canciones que me gustan</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {liked.length} {liked.length === 1 ? 'canción' : 'canciones'}
            </p>
          </div>
          {liked.length > 0 && (
            <button
              onClick={() => play(liked[0], liked)}
              className="ml-auto hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12"
            >
              <Play size={18} fill="currentColor" className="ml-0.5 sm:size-6" />
            </button>
          )}
        </div>

        {liked.length > 0 ? (
          <div className="px-2 pb-2 sm:px-3 sm:pb-3">
            {liked.slice(0, 5).map((song, i) => (
              <SongRow key={song.id} song={song} index={i} queue={liked} onLike={onLike} />
            ))}
          </div>
        ) : (
          <p className="px-3 pb-3 text-xs text-muted-foreground sm:px-5 sm:pb-5 sm:text-sm">
            Marca canciones con el corazón para verlas aquí.
          </p>
        )}
      </section>

      {/* Por álbum */}
      <Carousel title="Álbumes">
        {albums.slice(0, 10).map((al) => (
          <CollectionCard
            key={al.name}
            title={al.name}
            subtitle={al.artist}
            coverSong={{ coverId: al.coverId, hasCover: true }}
            songs={al.songs}
            onOpen={() => onOpenCollection({ kind: 'Álbum', name: al.name, songs: al.songs })}
          />
        ))}
      </Carousel>

      {/* Por artista */}
      <Carousel title="Artistas">
        {artists.slice(0, 10).map((ar) => (
          <CollectionCard
            key={ar.name}
            round
            title={ar.name}
            subtitle={`${ar.songs.length} ${ar.songs.length === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ar.coverId, hasCover: true }}
            songs={ar.songs}
            onOpen={() => onOpenCollection({ kind: 'Artista', name: ar.name, songs: ar.songs })}
          />
        ))}
      </Carousel>

      {/* Por género */}
      <Carousel title="Géneros">
        {genres.slice(0, 10).map((ge) => (
          <CollectionCard
            key={ge.name}
            title={ge.name}
            subtitle={`${ge.songs.length} ${ge.songs.length === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ge.coverId, hasCover: true }}
            songs={ge.songs}
            onOpen={() => onOpenCollection({ kind: 'Género', name: ge.name, songs: ge.songs })}
          />
        ))}
      </Carousel>

      {/* Espacio extra al final */}
      <div className="h-4" />
    </div>
  );
}