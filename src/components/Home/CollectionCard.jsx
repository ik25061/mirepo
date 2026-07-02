import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import Cover from '../Cover.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { artistCoverUrl } from '../../lib/api.js';

export default function CollectionCard({ title, subtitle, coverSong, songs, onOpen, round = false, artistName }) {
  const { play } = usePlayer();
  const [artistImageUrl, setArtistImageUrl] = useState(null);
  const [artistImageError, setArtistImageError] = useState(false);

  // Si es una colección de artista, intentar cargar artist.jpg
  useEffect(() => {
    if (!artistName) {
      setArtistImageUrl(null);
      return;
    }
    const url = artistCoverUrl(artistName);
    const img = new Image();
    img.onload = () => setArtistImageUrl(url);
    img.onerror = () => {
      setArtistImageUrl(null);
      setArtistImageError(true);
    };
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [artistName]);

  const useArtistImage = artistImageUrl && !artistImageError;

  return (
    <button
      onClick={onOpen}
      className="group relative w-32 shrink-0 rounded-lg bg-surface p-2 text-left transition hover:bg-surface-2 active:scale-95 sm:w-40 sm:rounded-xl sm:p-3"
      style={{
        scrollSnapAlign: 'start',
        touchAction: 'manipulation',
        width: 'clamp(120px, 20vw, 160px)' 
      }}
    >
      <div className="relative mb-1.5 sm:mb-3">
        {useArtistImage ? (
          <img
            src={artistImageUrl}
            alt={title}
            className={`aspect-square w-full object-cover shadow-lg ${round ? 'rounded-full' : 'rounded-md'}`}
          />
        ) : (
          <Cover
            song={coverSong}
            rounded={round ? 'rounded-full' : 'rounded-md'}
            className={`aspect-square w-full shadow-lg ${round ? 'rounded-full' : ''}`}
          />
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (songs?.length) play(songs[0], songs);
          }}
          className="absolute bottom-1 right-1 grid h-7 w-7 translate-y-1 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 active:opacity-100 sm:bottom-2 sm:right-2 sm:h-11 sm:w-11"
        >
          <Play size={12} fill="currentColor" className="ml-0.5 sm:size-5" />
        </span>
      </div>
      <p className="truncate text-xs font-semibold text-white sm:text-sm">{title}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:mt-0.5 sm:text-xs">
        {subtitle}
      </p>
    </button>
  );
}