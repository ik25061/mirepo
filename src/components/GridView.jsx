import { ArrowLeft, Play } from 'lucide-react';
import Cover from './Cover.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';

export default function GridView({ items, type, onBack, onOpenCollection, songs }) {
  const { play } = usePlayer();

  const getTitle = () => {
    switch(type) {
      case 'albums': return 'Álbumes';
      case 'artists': return 'Artistas';
      case 'genres': return 'Géneros';
      default: return 'Todos';
    }
  };

  const getIcon = () => {
    switch(type) {
      case 'albums': return '💿';
      case 'artists': return '🎤';
      case 'genres': return '🎵';
      default: return '📀';
    }
  };

  const getSubtitle = (item) => {
    if (type === 'albums') return item.artist;
    return `${item.songs.length} ${item.songs.length === 1 ? 'canción' : 'canciones'}`;
  };

  // Al hacer clic en un elemento, abre la colección correspondiente
  const handleOpen = (item) => {
    if (type === 'albums') {
      onOpenCollection({ 
        kind: 'Álbum', 
        name: item.name, 
        songs: item.songs 
      });
    } else if (type === 'artists') {
      onOpenCollection({ 
        kind: 'Artista', 
        name: item.name, 
        songs: item.songs 
      });
    } else if (type === 'genres') {
      onOpenCollection({ 
        kind: 'Género', 
        name: item.name, 
        songs: item.songs 
      });
    }
  };

  const isRound = type === 'artists';

  return (
    <div className="flex flex-col gap-6 pb-20 w-full">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <header>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getIcon()}</span>
          <h1 className="font-display text-3xl font-700 tracking-tight text-white">{getTitle()}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
        </p>
      </header>

      {/* Grid estilo Spotify con números */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item, idx) => (
          <div
            key={item.name}
            onClick={() => handleOpen(item)}
            className="group relative cursor-pointer"
          >
            <div className="relative overflow-hidden rounded-lg bg-surface-2 transition hover:bg-surface-2/70">
              {/* Número en la esquina superior izquierda - estilo Spotify */}
              <div className="absolute top-2 left-2 z-10">
                <span className="text-xs font-bold text-white/50 group-hover:text-white/80 transition-colors">
                  #{idx + 1}
                </span>
              </div>

              {/* Imagen */}
              <div className="aspect-square w-full">
                <Cover
                  song={{ coverId: item.coverId, hasCover: true }}
                  rounded={isRound ? 'rounded-full' : 'rounded-none'}
                  className={`w-full h-full ${isRound ? 'rounded-full' : ''}`}
                />
              </div>

              {/* Overlay con botón de reproducción al hacer hover */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.songs?.length) {
                      play(item.songs[0], item.songs);
                    }
                  }}
                  className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105"
                >
                  <Play size={22} fill="currentColor" className="ml-0.5" />
                </button>
              </div>
            </div>

            {/* Información */}
            <div className="mt-2 px-1">
              <p className="truncate text-sm font-semibold text-white group-hover:text-primary transition-colors">
                {item.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {getSubtitle(item)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}