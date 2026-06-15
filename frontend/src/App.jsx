import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Trash2, Search, Music, Disc, User, Radio, Clock } from 'lucide-react';
import './App.css';

const API_URL = 'http://localhost:5000'; 

function App() {
  const [songs, setSongs] = useState([]);
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [genres, setGenres] = useState([]);
  const [artists, setArtists] = useState([]);
  const [activeFilter, setActiveFilter] = useState({ type: 'all', value: null });

  const audioRef = useRef(new Audio());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Formateador de tiempo universal (sirve para la barra y las pistas individuales)
  const formatTime = (secs) => {
    if (isNaN(secs) || secs === null || secs === 0) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const fetchSongs = async (reset = false, preserveFilter = false) => {
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
      setHasMore(data.hasMore);
      
      extractCategories(newSongs);

      if (preserveFilter && activeFilter.type !== 'all') {
        // Modificación del filtro para que busque si el género seleccionado está incluido en la lista de géneros de la canción
        if (activeFilter.type === 'genre') {
          setFilteredSongs(newSongs.filter(song => 
            song.genre.toLowerCase().split(/[\/,]/).map(g => g.trim()).includes(activeFilter.value.toLowerCase())
          ));
        } else {
          setFilteredSongs(newSongs.filter(song => song[activeFilter.type] === activeFilter.value));
        }
      } else {
        setFilteredSongs(newSongs);
      }
    } catch (err) {
      console.error("Error al obtener canciones:", err);
    }
  };

  useEffect(() => {
    fetchSongs(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => handleNext();

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [filteredSongs, currentSongIndex]);

  useEffect(() => {
    const handleScroll = () => {
      if (!hasMore || loadingMore) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 160) {
        setLoadingMore(true);
        fetchSongs(false, activeFilter.type !== 'all').finally(() => {
          setLoadingMore(false);
        });
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, activeFilter, songs]);

  // Soporta múltiples géneros divididos por "/" o por ","
  const extractCategories = (allSongs) => {
    const genreSet = new Set();
    
    allSongs.forEach(song => {
      if (song.genre && song.genre !== "Desconocido" && song.genre !== "Urbano") {
        // Dividimos géneros por barra o coma (ej: "house / funk" -> ["house", "funk"])
        const individualGenres = song.genre.split(/[\/,]/);
        individualGenres.forEach(g => {
          const cleanG = g.trim();
          if (cleanG) {
            // Capitalizamos la primera letra de cada género de forma estética
            genreSet.add(cleanG.charAt(0).toUpperCase() + cleanG.slice(1).toLowerCase());
          }
        });
      }
    });

    // Si la lista está vacía añadimos uno genérico básico
    if (genreSet.size === 0) genreSet.add("Urbano");

    const artistMap = {};
    allSongs.forEach(song => {
      if (song.artist && song.artist !== "Desconocido") {
        if (!artistMap[song.artist] || (!artistMap[song.artist].imageUrl && song.imageUrl)) {
          artistMap[song.artist] = {
            name: song.artist,
            imageUrl: song.imageUrl ? `${API_URL}${song.imageUrl}` : null
          };
        }
      }
    });

    setGenres([...genreSet]);
    setArtists(Object.values(artistMap)); 
  };

  const handleFilter = (type, value) => {
    if (activeFilter.type === type && activeFilter.value === value) {
      setActiveFilter({ type: 'all', value: null });
      setFilteredSongs(songs);
    } else {
      setActiveFilter({ type, value });
      if (type === 'genre') {
        // Filtrar si la pista contiene el género dentro de su cadena múltiple
        const filtered = songs.filter(song => 
          song.genre.toLowerCase().split(/[\/,]/).map(g => g.trim()).includes(value.toLowerCase())
        );
        setFilteredSongs(filtered);
      } else {
        const filtered = songs.filter(song => song[type] === value);
        setFilteredSongs(filtered);
      }
    }
  };

  const playSongAudio = async (index) => {
    if (index === null || !filteredSongs[index]) return;

    const song = filteredSongs[index];
    const songUrl = `${API_URL}/songs/${encodeURIComponent(song.filename)}`;
    const audio = audioRef.current;

    if (audio.src !== songUrl) {
      audio.src = songUrl;
    }

    try {
      await audio.play();
      setCurrentSongIndex(index);
      setIsPlaying(true);
    } catch (err) {
      console.error('Error reproduciendo audio:', err);
      setIsPlaying(false);
    }
  };

  const handleNext = () => {
    if (filteredSongs.length === 0) return;
    const nextIndex = (currentSongIndex + 1) % filteredSongs.length;
    playSongAudio(nextIndex);
  };

  const handlePrev = () => {
    if (filteredSongs.length === 0) return;
    const prevIndex = (currentSongIndex - 1 + filteredSongs.length) % filteredSongs.length;
    playSongAudio(prevIndex);
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(err => console.error(err));
    }
  };

  const fetchMusicBrainzData = async (index, e) => {
    e.stopPropagation();
    const song = filteredSongs[index];

    try {
      const response = await fetch(`${API_URL}/api/songs/sync-metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: song.filename })
      });

      if (response.ok) {
        const result = await response.json();
        const { updatedSong } = result;

        alert(`✅ ¡Sincronización Completa!\n\n🎵 Título: ${updatedSong.title}\n🎤 Artista: ${updatedSong.artist}\n📀 Género: ${updatedSong.genre}`);
        
        setSongs((prevSongs) => {
          const updatedMaster = prevSongs.map((s) => 
            s.filename === song.filename || s.filename === updatedSong.filename
              ? { ...s, filename: updatedSong.filename, title: updatedSong.title, artist: updatedSong.artist, genre: updatedSong.genre, imageUrl: updatedSong.imageUrl }
              : s
          );
          extractCategories(updatedMaster);
          return updatedMaster;
        });

        setFilteredSongs((prevFiltered) => 
          prevFiltered.map((s) => 
            s.filename === song.filename || s.filename === updatedSong.filename
              ? { ...s, filename: updatedSong.filename, title: updatedSong.title, artist: updatedSong.artist, genre: updatedSong.genre, imageUrl: updatedSong.imageUrl }
              : s
          )
        );

        setTimeout(() => {
          fetchSongs(true, activeFilter.type !== 'all');
        }, 600);

      } else {
        const errData = await response.json();
        alert(`❌ Error: ${errData.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Error de red al sincronizar metadatos.");
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
      <header className="ytm-header">
        <div className="logo"><Radio color="#ff0000" fill="#ff0000" size={24} /> <span>YouTube Music</span><span className="badge">Local</span></div>
      </header>

      <main className="ytm-content">
        {/* SECCIÓN 1: GÉNEROS MÚLTIPLES */}
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

        {/* SECCIÓN 2: ARTISTAS */}
        <section className="ytm-section">
          <h2>Artistas</h2>
          <div className="artists-row">
            {artists.map(artist => (
              <div 
                key={artist.name} 
                className={`artist-circle-item ${activeFilter.value === artist.name ? 'active' : ''}`}
                onClick={() => handleFilter('artist', artist.name)}
              >
                <div className="avatar-placeholder">
                  {artist.imageUrl ? (
                    <img src={artist.imageUrl} alt={artist.name} className="artist-avatar-img" />
                  ) : (
                    <User size={28} />
                  )}
                </div>
                <span>{artist.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN 3: TRACKS CON TIEMPOS */}
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
                onClick={() => playSongAudio(index)}
              >
                <div className="track-img">
                  {song.imageUrl ? (
                    <img src={`${API_URL}${song.imageUrl}`} alt={song.title} className="track-img-thumb" />
                  ) : (
                    <div className="track-img-placeholder"><Music size={16} /></div>
                  )}
                </div>
                <div className="track-details">
                  <span className="track-title">{song.title}</span>
                  <span className="track-meta">
                    {song.artist} • {song.genre} 
                    {song.duration > 0 && ` • ${formatTime(song.duration)}`}
                  </span>
                </div>
                <div className="track-actions">
                  <button className="ytm-btn" onClick={(e) => fetchMusicBrainzData(index, e)} title="Sincronizar metadatos"><Search size={16} /></button>
                  <button className="ytm-btn delete" onClick={(e) => handleDeleteSong(song.filename, e)} title="Borrar de la PC"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>

          {loadingMore && (
            <div className="ytm-load-more">Cargando más música...</div>
          )}
        </section>
      </main>

      {/* REPRODUCTOR FLOTANTE PREMIUM Y RESPONSIVE */}
      <footer className="ytm-player-bar">
        <div className="ytm-player-left">
          {currentSongIndex !== null && filteredSongs[currentSongIndex] ? (
            <>
              <div className="player-thumbnail">
                {filteredSongs[currentSongIndex].imageUrl ? (
                  <img src={`${API_URL}${filteredSongs[currentSongIndex].imageUrl}`} alt="cover" className="player-cover-img" />
                ) : (
                  <Disc size={20} color="#ff0000" />
                )}
              </div>
              <div className="player-track-info">
                <div className="scroll-title">{filteredSongs[currentSongIndex].title}</div>
                <span>{filteredSongs[currentSongIndex].artist}</span>
                <div className="player-progress-wrapper">
                  <span style={{ fontSize: '11px', color: '#aaa', minWidth: '25px' }}>{formatTime(currentTime)}</span>
                  <input
                    className="player-progress"
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={(e) => {
                      const audio = audioRef.current;
                      audio.currentTime = Number(e.target.value);
                      setCurrentTime(Number(e.target.value));
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#aaa', minWidth: '25px' }}>{formatTime(duration)}</span>
                </div>
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
          <button onClick={handleNext} className="player-icon-btn"><SkipForward size={22} /></button>
        </div>
      </footer>
    </div>
  );
}

export default App;