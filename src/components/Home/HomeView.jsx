import { Heart, Play, Copy, Shuffle } from 'lucide-react';
import Carousel from './Carousel.jsx';
import CollectionCard from './CollectionCard.jsx';
import SongRow from '../SongRow.jsx';
import { buildAlbums, buildArtists, buildGenres } from '../../lib/format.js';
import { usePlayer } from '../../context/PlayerContext.jsx';

export default function HomeView({ 
  songs, 
  onOpenCollection, 
  onOpenGridView, 
  onLike, 
  onDislike, 
  onDislikeArtist, 
  onDelete, 
  onOpenDuplicates 
}) {
  const { play, shufflePlay } = usePlayer();
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
        <div className="flex items-center gap-4 p-4 sm:p-6 sm:pb-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg sm:h-20 sm:w-20 sm:rounded-xl">
            <Heart size={22} fill="currentColor" className="sm:hidden" />
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
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => shufflePlay(liked)}
                className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-white shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12"
                title="Reproducción aleatoria"
              >
                <Shuffle size={16} className="sm:size-5" />
              </button>
              <button
                onClick={() => play(liked[0], liked)}
                className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12"
              >
                <Play size={18} fill="currentColor" className="ml-0.5 sm:size-6" />
              </button>
            </div>
          )}
        </div>

        {liked.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-3 pb-4 sm:px-5 sm:pb-5">
            {liked.slice(0, 5).map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={liked}
                onLike={onLike}
                onDislike={onDislike}
                onDislikeArtist={onDislikeArtist}
                onDelete={onDelete}
                showDelete
              />
            ))}
          </div>
        ) : (
          <p className="px-4 pb-4 text-xs text-muted-foreground sm:px-6 sm:pb-6 sm:text-sm">
            Marca canciones con el corazón para verlas aquí.
          </p>
        )}
      </section>

      {/* Por álbum - con Ver todo */}
      <Carousel 
        title="Álbumes" 
        action={
          albums.length > 10 && (
            <button
              onClick={() => onOpenGridView('albums', albums)}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Ver todo
            </button>
          )
        }
      >
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

      {/* Por artista - con Ver todo */}
      <Carousel 
        title="Artistas" 
        action={
          artists.length > 10 && (
            <button
              onClick={() => onOpenGridView('artists', artists)}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Ver todo
            </button>
          )
        }
      >
        {artists.slice(0, 10).map((ar) => (
          <CollectionCard
            key={ar.name}
            round
            title={ar.name}
            subtitle={`${ar.songs.length} ${ar.songs.length === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ar.coverId, hasCover: true }}
            songs={ar.songs}
            artistName={ar.name}
            onOpen={() => onOpenCollection({ kind: 'Artista', name: ar.name, songs: ar.songs })}
          />
        ))}
      </Carousel>

      {/* Por género - con Ver todo */}
      <Carousel 
        title="Géneros" 
        action={
          genres.length > 10 && (
            <button
              onClick={() => onOpenGridView('genres', genres)}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Ver todo
            </button>
          )
        }
      >
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

      {/* Buscar duplicados */}
      {onOpenDuplicates && (
        <button
          onClick={onOpenDuplicates}
          className="animate-fade-in flex items-center gap-4 p-4 rounded-xl border border-border bg-gradient-to-r from-surface to-surface-2 hover:from-surface-2 hover:to-muted transition-all group"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-danger/20 text-danger group-hover:bg-danger/30 transition-colors">
            <Copy size={22} />
          </div>
          <div className="text-left">
            <p className="text-sm font-600 text-white">Buscar música duplicada</p>
            <p className="text-xs text-muted-foreground">Encuentra canciones repetidas y libera espacio</p>
          </div>
          <span className="ml-auto text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            Abrir →
          </span>
        </button>
      )}

      <div className="h-4" />
    </div>
  );
}