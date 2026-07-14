/**
 * ============================================================
 * LIKED SONGS VIEW - CANCIONES QUE ME GUSTAN CON FILTRO POR GÉNERO
 * ============================================================
 * 
 * Muestra todas las canciones marcadas como "Me gusta"
 * con la opción de filtrar por género y reproducirlas.
 */

import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Play, Shuffle, Heart, Loader2 } from 'lucide-react';
import SongRow from './SongRow.jsx';
import DownloadAllButton from './DownloadAllButton.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';
import { api } from '../lib/api.js';

export default function LikedSongsView({ 
  userId,
  onBack, 
  onLike, 
  onDislike, 
  onDislikeArtist, 
  onDelete,
  onAddToPlayList
}) {
  const { play, shufflePlay } = usePlayer();
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [likedSongs, setLikedSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar TODAS las canciones que me gustan desde el servidor
  useEffect(() => {
    const loadLikedSongs = async () => {
      try {
        setLoading(true);
        const data = await api.getLikedSongs(userId);
        setLikedSongs(data.songs || []);
      } catch (err) {
        console.error('Error cargando canciones que me gustan:', err);
      } finally {
        setLoading(false);
      }
    };
    loadLikedSongs();
  }, [userId]);

  // Extraer géneros únicos de las canciones que me gustan
  const genres = useMemo(() => {
    const genreSet = new Set();
    likedSongs.forEach(s => {
      const songGenres = Array.isArray(s.genre) ? s.genre : [s.genre || 'Sin género'];
      songGenres.forEach(g => {
        if (g && g !== 'Sin género') genreSet.add(g);
      });
    });
    return ['all', ...Array.from(genreSet).sort()];
  }, [likedSongs]);

  // Filtrar canciones por género
  const filteredSongs = useMemo(() => {
    if (selectedGenre === 'all') return likedSongs;
    return likedSongs.filter(s => {
      const songGenres = Array.isArray(s.genre) ? s.genre : [s.genre || ''];
      return songGenres.includes(selectedGenre);
    });
  }, [likedSongs, selectedGenre]);

  const totalSec = filteredSongs.reduce((acc, s) => acc + (s.duration || 0), 0);
  
  // Calcular likedIds a partir de likedSongs (todas están liked en esta vista)
  const likedIds = new Set(likedSongs.map(s => s.id));

  return (

    <div className="flex flex-col gap-4 pb-20">
      
      {/* ===== BOTÓN VOLVER ===== */}
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      {/* ===== HEADER ===== */}
      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        <div className="grid h-36 w-36 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-2xl sm:h-44 sm:w-44">
          <Heart size={48} fill="currentColor" />
        </div>
        <div className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lista</p>
          <h1 className="mt-1 font-display text-3xl font-700 tracking-tight text-balance sm:text-4xl">
            Canciones que me gustan
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {filteredSongs.length} {filteredSongs.length === 1 ? 'canción' : 'canciones'}
            {selectedGenre !== 'all' && ` · ${selectedGenre}`}
            <span className="mx-2">·</span>
            {formatTime(totalSec)}
          </p>

          {/* ===== BOTONES DE REPRODUCCIÓN ===== */}
          {filteredSongs.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => play(filteredSongs[0], likedSongs)}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
                >
                  <Play size={18} fill="currentColor" /> Reproducir
                </button>
                <button
                  onClick={() => shufflePlay(likedSongs)}
                  className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-6 py-2.5 text-sm font-semibold text-foreground shadow transition hover:scale-105"
                  title="Reproducción aleatoria"
                >
                  <Shuffle size={16} /> Aleatorio
                </button>
              </div>
              <DownloadAllButton
                songs={filteredSongs}
                onComplete={(result) => {
                  if (result && result.successCount > 0) {
                    console.log('[LikedSongsView] Descarga completada:', result);
                  }
                }}
              />
            </div>
          )}
        </div>
      </header>

      {/* ===== FILTRO POR GÉNERO ===== */}
      {genres.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {genres.map(genre => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                selectedGenre === genre
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-2 text-muted-foreground hover:text-foreground'
              }`}
            >
              {genre === 'all' ? 'Todos' : genre}
            </button>
          ))}
        </div>
      )}

      {/* ===== LISTA DE CANCIONES ===== */}
      {filteredSongs.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface/50 p-2">
          {filteredSongs.map((song, i) => (
          <SongRow
              key={song.id}
              song={song}
              index={i}
              queue={likedSongs}
              onLike={onLike}
              onDislike={onDislike}
              onDislikeArtist={onDislikeArtist}
              onDelete={onDelete}
              showDelete
              context={null}
              likedIds={likedIds}
            />

          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Heart size={48} className="text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">
            {selectedGenre !== 'all'
              ? `No hay canciones que te gusten del género "${selectedGenre}"`
              : 'Marca canciones con el corazón para verlas aquí.'}
          </p>
        </div>
      )}
    </div>
  );
}