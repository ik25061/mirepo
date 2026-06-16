import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Trash2, Search, Music, Disc, User, Radio, Clock } from 'lucide-react';
import './App.css';

const API_URL = 'http://172.16.12.4:5000';

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
  
  // Estado para edición manual
  const [editingSong, setEditingSong] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', artist: '', genre: '', album: '' });

  const audioRef = useRef(new Audio());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === null || secs === 0) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const fetchSongs = async (reset = false, preserveFilter = false) => {
    const currentOffset = reset ? 0 : offset;
    let url = `${API_URL}/api/songs?limit=30&offset=${currentOffset}`;
    
    // Si hay filtro activo, agregarlo a la URL
    if (activeFilter.type !== 'all' && activeFilter.value) {
      url += `&${activeFilter.type}=${encodeURIComponent(activeFilter.value)}`;
    }
    
    try {
      const response = await fetch(url);
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
      
      // Extraer categorías después de obtener canciones
      if (reset) {
        await fetchCategories();
      }
    } catch (err) {
      console.error("Error al obtener canciones:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const [genresRes, artistsRes] = await Promise.all([
        fetch(`${API_URL}/api/genres`),
        fetch(`${API_URL}/api/artists`)
      ]);
      const genresData = await genresRes.json();
      const artistsData = await artistsRes.json();
      setGenres(genresData);
      setArtists(artistsData.map(name => ({ name, imageUrl: null })));
    } catch (err) {
      console.error("Error al obtener categorías:", err);
    }
  };

  useEffect(() => {
    fetchSongs(true);
  }, [activeFilter]);

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

  const handleFilter = (type, value) => {
    if (activeFilter.type === type && activeFilter.value === value) {
      setActiveFilter({ type: 'all', value: null });
    } else {
      setActiveFilter({ type, value });
    }
    setOffset(0);
    fetchSongs(true);
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
        
        // Refrescar lista completa
        await fetchSongs(true);
        await fetchCategories();

      } else {
        const errData = await response.json();
        alert(`❌ Error: ${errData.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Error de red al sincronizar metadatos.");
    }
  };

  const handleEditClick = (song, e) => {
    e.stopPropagation();
    setEditingSong(song);
    setEditForm({
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      album: song.album
    });
  };

  const handleSaveMetadata = async () => {
    if (!editingSong) return;

    try {
      const response = await fetch(`${API_URL}/api/songs/local-metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: editingSong.filename,
          title: editForm.title,
          artist: editForm.artist,
          genre: editForm.genre,
          album: editForm.album
        })
      });

      if (response.ok) {
        alert('✅ Metadatos actualizados correctamente');
        await fetchSongs(true);
        await fetchCategories();
        setEditingSong(null);
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Error de red al actualizar metadatos');
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
      if (res.ok) {
        await fetchSongs(true);
        await fetchCategories();
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="ytm-container">
      <header className="ytm-header">
        <div className="logo"><Radio color="#ff0000" fill="#ff0000" size={24} /> <span>YouTube Music</span><span className="badge">Local</span></div>
      </header>

      <main className="ytm-content">
        {/* SECCIÓN 1: GÉNEROS */}
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

        {/* SECCIÓN 3: TRACKS */}
        <section className="ytm-section tracks-section">
          <div className="section-header">
            <h2>{activeFilter.type !== 'all' ? `Resultados: ${activeFilter.value}` : 'Todas las canciones'}</h2>
            {activeFilter.type !== 'all' && <button onClick={() => handleFilter('all', null)} className="clear-filter">Ver todas</button>}
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
                  <button className="ytm-btn" onClick={(e) => handleEditClick(song, e)} title="Editar metadatos">✏️</button>
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

      {/* REPRODUCTOR FLOTANTE */}
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

      {/* MODAL DE EDICIÓN */}
      {editingSong && (
        <div className="modal-overlay" onClick={() => setEditingSong(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Editar metadatos</h3>
            <input 
              type="text" 
              placeholder="Título" 
              value={editForm.title}
              onChange={(e) => setEditForm({...editForm, title: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Artista" 
              value={editForm.artist}
              onChange={(e) => setEditForm({...editForm, artist: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Género" 
              value={editForm.genre}
              onChange={(e) => setEditForm({...editForm, genre: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Álbum" 
              value={editForm.album}
              onChange={(e) => setEditForm({...editForm, album: e.target.value})}
            />
            <div className="modal-buttons">
              <button onClick={handleSaveMetadata}>Guardar</button>
              <button onClick={() => setEditingSong(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;