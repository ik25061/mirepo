import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Trash2, Search, Music, Disc, User, Radio } from 'lucide-react';
import './App.css';

const API_URL = 'http://localhost:5000'; // Cambia por tu IP (ej: 192.168.1.X) para usarlo en el celular
const CROSSFADE_TIME = 4;

function App() {
  const [songs, setSongs] = useState([]);
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Estados para las nuevas secciones estilo YT Music
  const [genres, setGenres] = useState([]);
  const [artists, setArtists] = useState([]);
  const [activeFilter, setActiveFilter] = useState({ type: 'all', value: null });

  // Refs de Web Audio API para Crossfade
  const audioContextRef = useRef(null);
  const currentSourceRef = useRef(null);
  const currentGainNodeRef = useRef(null);
  const songTimeoutRef = useRef(null);

  // 1. Cargar canciones de la PC (Lazy Load)
  const fetchSongs = async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    try {
      const response = await fetch(`${API_URL}/api/songs?limit=30&offset=${currentOffset}`);
      const data = await response.json();
      
      let newSongs = [];
      if (reset) {
        newSongs = data.songs;
        setOffset(30);
      } else {
        newSongs = [...songs, ...data.songs];
        setOffset((prev) => prev + 30);
      }
      
      setSongs(newSongs);
      setFilteredSongs(newSongs);
      setHasMore(data.hasMore);
      
      // Extraer géneros y artistas únicos para los bloques de la pantalla de inicio
      extractCategories(newSongs);
    } catch (err) {
      console.error("Error al obtener canciones:", err);
    }
  };

  useEffect(() => {
    fetchSongs(true);
  }, []);

  const extractCategories = (allSongs) => {
    const uniqueGenres = [...new Set(allSongs.map(s => s.genre))].filter(g => g !== "Desconocido");
    const uniqueArtists = [...new Set(allSongs.map(s => s.artist))].filter(a => a !== "Desconocido");
    setGenres(uniqueGenres);
    setArtists(uniqueArtists);
  };

  // Filtrar la lista al tocar una categoría
  const handleFilter = (type, value) => {
    if (activeFilter.type === type && activeFilter.value === value) {
      setActiveFilter({ type: 'all', value: null });
      setFilteredSongs(songs);
    } else {
      setActiveFilter({ type, value });
      const filtered = songs.filter(song => song[type] === value);
      setFilteredSongs(filtered);
    }
  };

  // 2. Motor de Audio con Crossfade (Web Audio API)
  const playSongAudio = async (index, fadeOutCurrent = true) => {
    if (index === null || !filteredSongs[index]) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (songTimeoutRef.current) clearTimeout(songTimeoutRef.current);

    // Fade out suave de la canción anterior si está activa
    if (fadeOutCurrent && currentGainNodeRef.current && currentSourceRef.current) {
      const oldGain = currentGainNodeRef.current;
      oldGain.gain.linearRampToValueAtTime(oldGain.gain.value, ctx.currentTime);
      oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_TIME);
    }

    try {
      const songUrl = `${API_URL}/songs/${encodeURIComponent(filteredSongs[index].filename)}`;
      const response = await fetch(songUrl);
      const arrayBuffer = await response.clone().arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(fadeOutCurrent ? 0 : 1, ctx.currentTime);
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (fadeOutCurrent) {
        gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + CROSSFADE_TIME);
      }

      currentSourceRef.current = source;
      currentGainNodeRef.current = gainNode;
      setCurrentSongIndex(index);
      setIsPlaying(true);

      source.start(0);

      // Programar Crossfade automático al final del track
      const timeUntilCrossfade = (audioBuffer.duration - CROSSFADE_TIME) * 1000;
      songTimeoutRef.current = setTimeout(() => {
        handleNext(true);
      }, Math.max(0, timeUntilCrossfade));

    } catch (err) {
      console.error("Error decodificando audio:", err);
      handleNext(false);
    }
  };

  const handleNext = (useCrossfade = false) => {
    if (filteredSongs.length === 0) return;
    const nextIndex = (currentSongIndex + 1) % filteredSongs.length;
    playSongAudio(nextIndex, useCrossfade);
  };

  const handlePrev = () => {
    if (filteredSongs.length === 0) return;
    const prevIndex = (currentSongIndex - 1 + filteredSongs.length) % filteredSongs.length;
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

  // 3. Sincronizar Metadatos con MusicBrainz
const fetchMusicBrainzData = async (index, e) => {
  e.stopPropagation();
  const song = filteredSongs[index];
  const cleanTitle = song.title.replace(/[^a-zA-Z0-9 ]/g, "");

  try {
    // 1. Buscar la canción en MusicBrainz para obtener Artista, Género y el ID de Grabación (MBID)
    const response = await fetch(`https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(cleanTitle)}&fmt=json`);
    const data = await response.json();

    if (data.recordings && data.recordings.length > 0) {
      const match = data.recordings[0];
      
      // Datos encontrados en internet
      const newTitle = match.title || song.title;
      const artistName = match['artist-credit']?.[0]?.name || "Desconocido";
      const genreName = match.tags?.[0]?.name || "Urbano";
      
      // Intentar rastrear si tiene una carátula asociada usando el ID de la versión (release)
      let imageUrl = null;
      const releaseId = match.releases?.[0]?.id;
      if (releaseId) {
        try {
          const coverResponse = await fetch(`https://coverartarchive.org/release/${releaseId}`);
          if (coverResponse.ok) {
            const coverData = await coverResponse.json();
            imageUrl = coverData.images?.[0]?.image || null; // URL de la imagen original
          }
        } catch (err) {
          console.log("Este álbum no cuenta con carátula en CoverArtArchive");
        }
      }

      // 2. Enviar los datos validados hacia el Backend para guardarlos EN EL DISCO DURO
      const saveResponse = await fetch(`${API_URL}/api/songs/update-metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: song.filename,
          title: newTitle,
          artist: artistName,
          genre: genreName,
          imageUrl: imageUrl
        })
      });

      if (saveResponse.ok) {
        alert(`¡Sincronización Completa!\n\nEl archivo físico fue editado:\nTítulo: ${newTitle}\nArtista: ${artistName}\nGénero: ${genreName}${imageUrl ? '\n📸 ¡Carátula descargada e inyectada!' : ''}`);
        
        // Refrescar toda la biblioteca para reflejar el cambio de nombre de inmediato
        fetchSongs(true);
      } else {
        const errData = await saveResponse.json();
        alert(`Error al guardar en disco: ${errData.error}`);
      }

    } else {
      alert("No se encontraron coincidencias exactas en la nube para esta pista.");
    }
  } catch (err) {
    console.error(err);
    alert("Error de red al conectar con los servidores de metadatos.");
  }
};

  const handleDeleteSong = async (filename, e) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar archivo permanentemente del disco duro de la PC?")) return;
    try {
      const res = await fetch(`${API_URL}/api/songs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      if (res.ok) fetchSongs(true);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="ytm-container">
      {/* Barra de Navegación Superior */}
      <header className="ytm-header">
        <div className="logo"><Radio color="#ff0000" fill="#ff0000" size={24} /> <span>YouTube Music</span><span className="badge">Local</span></div>
      </header>

      <main className="ytm-content">
        {/* SECCIÓN 1: GÉNEROS (Sustituye a Populares) */}
        <section className="ytm-section">
          <h2>Géneros</h2>
          <div className="tiles-grid">
            {genres.map(genre => (
              <div 
                key={genre} 
                className={`genre-tile ${activeFilter.value === genre ? 'active' : ''}`}
                onClick={() => handleFilter('genre', genre)}
              >
                <Disc size={32} className="tile-icon" />
                <span>{genre}</span>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN 2: ARTISTAS (Sustituye a Morning Boost) */}
        <section className="ytm-section">
          <h2>Artistas</h2>
          <div className="artists-row">
            {artists.map(artist => (
              <div 
                key={artist} 
                className={`artist-circle-item ${activeFilter.value === artist ? 'active' : ''}`}
                onClick={() => handleFilter('artist', artist)}
              >
                <div className="avatar-placeholder">
                  <User size={28} />
                </div>
                <span>{artist}</span>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN 3: LISTA DE CANCIONES (Filtrada o Completa) */}
        <section className="ytm-section tracks-section">
          <div className="section-header">
            <h2>{activeFilter.type !== 'all' ? `Resultados: ${activeFilter.value}` : 'Todas las canciones'}</h2>
            {activeFilter.type !== 'all' && <button onClick={() => { setFilteredSongs(songs); setActiveFilter({ type: 'all', value: null }); }} className="clear-filter">Ver todas</button>}
          </div>
          
          <div className="ytm-track-list">
            {filteredSongs.map((song, index) => (
              <div 
                key={song.filename + index} 
                className={`ytm-track-row ${currentSongIndex === index ? 'playing' : ''}`}
                onClick={() => playSongAudio(index, false)}
              >
                <div className="track-img"><Music size={16} /></div>
                <div className="track-details">
                  <span className="track-title">{song.title}</span>
                  <span className="track-meta">{song.artist} • {song.genre}</span>
                </div>
                <div className="track-actions">
                  <button className="ytm-btn" onClick={(e) => fetchMusicBrainzData(index, e)} title="Sincronizar metadatos"><Search size={16} /></button>
                  <button className="ytm-btn delete" onClick={(e) => handleDeleteSong(song.filename, e)} title="Borrar de la PC"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>

          {hasMore && activeFilter.type === 'all' && (
            <button className="ytm-load-more" onClick={() => fetchSongs(false)}>Cargar más música</button>
          )}
        </section>
      </main>

      {/* REPRODUCTOR FLOTANTE ESTILO YOUTUBE MUSIC */}
      <footer className="ytm-player-bar">
        <div className="ytm-player-left">
          {currentSongIndex !== null ? (
            <>
              <div className="player-thumbnail animate-spin-slow"><Disc size={20} color="#ff0000" /></div>
              <div className="player-track-info">
                <div className="scroll-title">{filteredSongs[currentSongIndex].title}</div>
                <span>{filteredSongs[currentSongIndex].artist}</span>
              </div>
            </>
          ) : (
            <span className="no-track">No hay pista seleccionada</span>
          )}
        </div>

        <div className="ytm-player-center">
          <button onClick={handlePrev} className="player-icon-btn"><SkipBack size={22} /></button>
          <button onClick={togglePlayPause} className="ytm-play-trigger">
            {isPlaying ? <Pause size={24} fill="black" color="black" /> : <Play size={24} fill="black" color="black" />}
          </button>
          <button onClick={() => handleNext(true)} className="player-icon-btn"><SkipForward size={22} /></button>
        </div>
      </footer>
    </div>
  );
}

export default App;