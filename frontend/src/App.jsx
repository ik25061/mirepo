import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Trash2, Music } from 'lucide-react';
import './App.css'; // Añadiremos estilos oscuros aquí abajo

const API_URL = 'http://localhost:5000';

function App() {
  const [songs, setSongs] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef(null);

  // Cargar canciones al iniciar
  const fetchSongs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/songs`);
      const data = await response.json();
      setSongs(data);
    } catch (error) {
      console.error("Error cargando canciones:", error);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // Controlar reproducción/pausa física del elemento <audio>
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentSongIndex]);

  // Sincronizar controles multimedia del sistema operativo (Segundo plano real)
  useEffect(() => {
    if (currentSongIndex !== null && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: songs[currentSongIndex].replace(/\.[^/.]+$/, ""), // Quitar extensión
        artist: 'Reproductor Local',
        album: 'Mi Biblioteca'
      });

      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, [currentSongIndex, songs]);

  const handlePlaySong = (index) => {
    setCurrentSongIndex(index);
    setIsPlaying(true);
  };

  const handleNext = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prevIndex) => (prevIndex + 1) % songs.length);
    setIsPlaying(true);
  };

  const handlePrev = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prevIndex) => (prevIndex - 1 + songs.length) % songs.length);
    setIsPlaying(true);
  };

  // 🔴 FUNCIÓN CRÍTICA: Eliminar del disco duro
  const handleDeleteSong = async (filename, index, e) => {
    e.stopPropagation(); // Evita que se reproduzca la canción al hacer click en borrar

    const confirmDelete = window.confirm(`¿Estás seguro de que quieres eliminar PERMANENTEMENTE "${filename}" de tu computadora?`);
    if (!confirmDelete) return;

    try {
      const response = await fetch(`${API_URL}/api/songs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      if (response.ok) {
        // Si la canción borrada estaba sonando, pararla o saltar a la siguiente
        if (currentSongIndex === index) {
          setIsPlaying(false);
          setCurrentSongIndex(null);
        }
        // Recargar la lista desde el servidor
        fetchSongs();
      } else {
        alert("No se pudo eliminar el archivo.");
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar / Lista de canciones */}
      <div className="sidebar">
        <h2>🎵 Mi Biblioteca</h2>
        <div className="song-list">
          {songs.map((song, index) => (
            <div 
              key={song} 
              className={`song-item ${currentSongIndex === index ? 'active' : ''}`}
              onClick={() => handlePlaySong(index)}
            >
              <Music size={18} className="icon" />
              <span className="song-name">{song.replace(/\.[^/.]+$/, "")}</span>
              <button 
                className="delete-btn" 
                onClick={(e) => handleDeleteSong(song, index, e)}
                title="Eliminar de la computadora"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Reproductor Inferior (Estilo Spotify) */}
      <div className="player-bar">
        <div className="current-track-info">
          {currentSongIndex !== null ? (
            <>
              <p className="player-title">{songs[currentSongIndex].replace(/\.[^/.]+$/, "")}</p>
              <p className="player-sub">Archivo Local</p>
            </>
          ) : (
            <p className="player-title">Ninguna canción seleccionada</p>
          )}
        </div>

        <div className="player-controls">
          <button onClick={handlePrev} className="control-btn"><SkipBack /></button>
          <button onClick={() => setIsPlaying(!isPlaying)} className="play-btn">
            {isPlaying ? <Pause fill="black" /> : <Play fill="black" />}
          </button>
          <button onClick={handleNext} className="control-btn"><SkipForward /></button>
        </div>

        <div className="hidden-audio">
          {currentSongIndex !== null && (
            <audio
              ref={audioRef}
              src={`${API_URL}/songs/${encodeURIComponent(songs[currentSongIndex])}`}
              onEnded={handleNext}
              controls
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;