import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Trash2, Music, Search, RefreshCw } from 'lucide-react';
import './App.css';

const API_URL = 'http://localhost:5000'; // Cambia por tu IP para el celular
const CROSSFADE_TIME = 4; // Segundos de transición entre canciones

function App() {
  const [songs, setSongs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sortBy, setSortBy] = useState('none'); // 'none', 'artist', 'genre'

  // Refs para Web Audio API (Crucial para Crossfade)
  const audioContextRef = useRef(null);
  const currentSourceRef = useRef(null);
  const currentGainNodeRef = useRef(null);
  const startTimeRef = useRef(0);
  const songTimeoutRef = useRef(null);

  // 1. Cargar Canciones (Lazy Load / Paginación)
  const fetchSongs = async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    try {
      const response = await fetch(`${API_URL}/api/songs?limit=15&offset=${currentOffset}`);
      const data = await response.json();
      
      if (reset) {
        setSongs(data.songs);
        setOffset(15);
      } else {
        setSongs((prev) => [...prev, ...data.songs]);
        setOffset((prev) => prev + 15);
      }
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Error cargando canciones", err);
    }
  };

  useEffect(() => {
    fetchSongs(true);
  }, []);

  // 2. Motor de Audio con Crossfade (Web Audio API)
  const playSongAudio = async (index, fadeOutCurrent = true) => {
    if (index === null || !songs[index]) return;

    // Inicializar el contexto de audio si no existe
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    // Detener timeouts previos de transición
    if (songTimeoutRef.current) clearTimeout(songTimeoutRef.current);

    // Fade out de la canción que está sonando actualmente
    if (fadeOutCurrent && currentGainNodeRef.current && currentSourceRef.current) {
      const oldGain = currentGainNodeRef.current;
      oldGain.gain.linearRampToValueAtTime(oldGain.gain.value, ctx.currentTime);
      oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_TIME);
    }

    try {
      // Descargar el archivo de audio en buffer
      const songUrl = `${API_URL}/songs/${encodeURIComponent(songs[index].filename)}`;
      const response = await fetch(songUrl);
      const arrayBuffer = await response.clone().arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Crear nodos para la NUEVA canción
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = ctx.createGain();
      // Empezar en silencio si hay crossfade, si no, volumen normal
      gainNode.gain.setValueAtTime(fadeOutCurrent ? 0 : 1, ctx.currentTime);
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Aplicar Fade In a la nueva canción
      if (fadeOutCurrent) {
        gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + CROSSFADE_TIME);
      }

      // Guardar referencias globales de la canción activa
      currentSourceRef.current = source;
      currentGainNodeRef.current = gainNode;
      setCurrentSongIndex(index);
      setIsPlaying(true);

      source.start(0);

      // Programar el Crossfade automático X segundos antes de que termine
      const duration = audioBuffer.duration;
      const timeUntilCrossfade = (duration - CROSSFADE_TIME) * 1000;

      songTimeoutRef.current = setTimeout(() => {
        handleNext(true); // Activa la siguiente canción aplicando crossfade
      }, Math.max(0, timeUntilCrossfade));

    } catch (err) {
      console.error("Error decodificando el audio:", err);
      handleNext(false); // Saltar si hay error
    }
  };

  const handleNext = (useCrossfade = false) => {
    if (songs.length === 0) return;
    const nextIndex = (currentSongIndex + 1) % songs.length;
    playSongAudio(nextIndex, useCrossfade);
  };

  const handlePrev = () => {
    if (songs.length === 0) return;
    const prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    playSongAudio(prevIndex, false);
  };

  const togglePlayPause = () => {
    if (!audioContextRef.current) return;
    if (isPlaying) {
      audioContextRef.current.suspend();
      setIsPlaying(false);
    } else {
      audioContextRef.current.resume();
      setIsPlaying(true);
    }
  };

  // 3. Organizar y ordenar biblioteca
  const getSortedSongs = () => {
    let sorted = [...songs];
    if (sortBy === 'artist') {
      sorted.sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (sortBy === 'genre') {
      sorted.sort((a, b) => a.genre.localeCompare(b.genre));
    }
    return sorted;
  };

  // 4. Buscar e integrar Metadatos de MusicBrainz API
  const fetchMusicBrainzData = async (index, e) => {
    e.stopPropagation();
    const song = songs[index];
    // Limpiar el nombre para mejorar la búsqueda
    const cleanTitle = song.title.replace(/[^a-zA-Z0-9 ]/g, "");

    try {
      // Consulta HTTP a la API abierta de MusicBrainz
      const response = await fetch(`https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(cleanTitle)}&fmt=json`);
      const data = await response.json();

      if (data.recordings && data.recordings.length > 0) {
        const bestMatch = data.recordings[0];
        const artistName = bestMatch['artist-credit']?.[0]?.name || "Desconocido";
        const genreName = bestMatch.tags?.[0]?.name || "General";

        // Actualizar visualmente la canción en el estado
        const updatedSongs = [...songs];
        updatedSongs[index] = {
          ...song,
          artist: artistName,
          genre: genreName
        };
        setSongs(updatedSongs);
        alert(`¡Metadatos encontrados!\nArtista: ${artistName}\nGénero estimado: ${genreName}`);
      } else {
        alert("No se encontraron coincidencias exactas en MusicBrainz.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con MusicBrainz.");
    }
  };

  const handleDeleteSong = async (filename, index, e) => {
    e.stopPropagation();
    if (!window.confirm("¿Borrar permanentemente de la PC?")) return;
    try {
      const res = await fetch(`${API_URL}/api/songs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      if (res.ok) fetchSongs(true);
    } catch (err) { console.error(err); }
  };

  const sortedSongs = getSortedSongs();

  return (
    <div className="app-container">
      {/* Controles de Organización superiores */}
      <div className="filter-bar">
        <span>Organizar por:</span>
        <button className={sortBy === 'none' ? 'active-filter' : ''} onClick={() => setSortBy('none')}>Original</button>
        <button className={sortBy === 'artist' ? 'active-filter' : ''} onClick={() => setSortBy('artist')}>Artista</button>
        <button className={sortBy === 'genre' ? 'active-filter' : ''} onClick={() => setSortBy('genre')}>Género</button>
      </div>

      <div className="sidebar">
        <h2>🎵 Mi Reproductor Inteligente</h2>
        <div className="song-list">
          {sortedSongs.map((song, index) => (
            <div 
              key={song.filename + index} 
              className={`song-item ${currentSongIndex === index ? 'active' : ''}`}
              onClick={() => playSongAudio(index, false)}
            >
              <Music size={18} className="icon" />
              <div className="song-info-block">
                <span className="song-name">{song.title}</span>
                <span className="song-meta">{song.artist} • {song.genre}</span>
              </div>
              
              <div className="actions">
                <button 
                  className="meta-btn" 
                  onClick={(e) => fetchMusicBrainzData(index, e)} 
                  title="Buscar metadatos en internet"
                >
                  <Search size={15} />
                </button>
                <button 
                  className="delete-btn" 
                  onClick={(e) => handleDeleteSong(song.filename, index, e)}
                  title="Borrar de la PC"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Botón de Lazy Load */}
        {hasMore && (
          <button className="load-more-btn" onClick={() => fetchSongs(false)}>
            <RefreshCw size={14} style={{ marginRight: '5px' }} /> Cargar más canciones
          </button>
        )}
      </div>

      {/* Reproductor Estilo Spotify */}
      <div className="player-bar">
        <div className="current-track-info">
          {currentSongIndex !== null ? (
            <>
              <p className="player-title">{songs[currentSongIndex].title}</p>
              <p className="player-sub">{songs[currentSongIndex].artist} ({CROSSFADE_TIME}s Crossfade Activo)</p>
            </>
          ) : (
            <p className="player-title">Modo Espera</p>
          )}
        </div>

        <div className="player-controls">
          <button onClick={handlePrev} className="control-btn"><SkipBack /></button>
          <button onClick={togglePlayPause} className="play-btn">
            {isPlaying ? <Pause fill="black" /> : <Play fill="black" />}
          </button>
          <button onClick={() => handleNext(true)} className="control-btn"><SkipForward /></button>
        </div>
      </div>
    </div>
  );
}

export default App;