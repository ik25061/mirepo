// components/ArtistView.jsx
// Vista de todas las canciones de un artista con descarga y ocultación
import { useState, useMemo } from "react";
import {
  Play,
  Music2,
  User,
  ArrowLeft,
  Download,
  ThumbsDown,
  Heart,
  Trash2,
  Search,
} from "lucide-react";
import { VirtualList } from "./VirtualList";

function formatTime(s) {
  if (!isFinite(s) || s === 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ArtistView({
  artistName,
  tracks,
  currentTrack,
  isPlaying,
  likedIds,
  onPlay,
  onLike,
  onDelete,
  onSync,
  onBack,
  onHideArtist,
  onRefresh,
}) {
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Filtrar solo canciones de este artista
  const artistTracks = useMemo(() => {
    return tracks.filter((t) => t.artist === artistName);
  }, [tracks, artistName]);

  // Búsqueda dentro del artista
  const filtered = useMemo(() => {
    if (!search) return artistTracks;
    return artistTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.album.toLowerCase().includes(search.toLowerCase())
    );
  }, [artistTracks, search]);

  // Obtener portada del artista (de la primera canción que tenga imagen)
  const artistCover = useMemo(() => {
    for (const t of artistTracks) {
      if (t.cover) return t.cover;
    }
    return null;
  }, [artistTracks]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#121212" }}>
      {/* Header con botones */}
      <div className="px-4 pt-12 pb-4" style={{ background: "linear-gradient(180deg, #1a1a3a 0%, #121212 100%)" }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack}
            className="flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ width: 36, height: 36 }}>
            <ArrowLeft size={20} style={{ color: "#fff" }} />
          </button>

          {/* "No me gusta este artista" - ARRIBA A LA DERECHA, con separación */}
          <button
            onClick={() => {
              if (window.confirm(`¿Ocultar todas las canciones de "${artistName}"?`)) {
                onHideArtist(artistName);
                onBack();
              }
            }}
            className="flex items-center gap-2 rounded-full hover:bg-red-500/10 transition-colors"
            style={{ padding: "8px 16px", color: "#ff4444", fontSize: 12, fontWeight: 600, border: "1px solid rgba(255, 68, 68, 0.3)" }}
            title={`Ocultar ${artistName} de tu biblioteca`}>
            <ThumbsDown size={14} />
            No me gusta este artista
          </button>
        </div>

        {/* Info del artista */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-shrink-0 flex items-center justify-center rounded-full overflow-hidden"
            style={{ width: 72, height: 72, background: "#282828" }}>
            {artistCover ? (
              <img src={artistCover} alt={artistName} className="w-full h-full object-cover" />
            ) : (
              <User size={32} style={{ color: "#535353" }} />
            )}
          </div>
          <div>
            <h1 className="text-white" style={{ fontSize: 22, fontWeight: 800 }}>{artistName}</h1>
            <p style={{ fontSize: 13, color: "#a7a7a7" }}>
              {artistTracks.length} {artistTracks.length === 1 ? "canción" : "canciones"}
            </p>
          </div>
        </div>

        {/* Botón Descargar todas + buscador */}
        <div className="flex items-center gap-3">
          <button onClick={handleDownloadAll} disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: "#1db954", color: "#000", fontSize: 13, fontWeight: 700 }}>
            <Download size={15} />
            {downloading ? "Descargando..." : "Descargar todas"}
          </button>

          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#282828" }}>
            <Search size={14} style={{ color: "#a7a7a7", flexShrink: 0 }} />
            <input type="text" placeholder="Buscar en este artista..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-white outline-none" style={{ fontSize: 13 }} />
          </div>
        </div>
      </div>

      {/* Lista de canciones con VirtualList */}
      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Music2 size={40} style={{ color: "#535353", marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: "#a7a7a7" }}>
              {search ? `No se encontraron canciones para "${search}"` : "No hay canciones de este artista"}
            </p>
          </div>
        ) : (
          <VirtualList items={filtered} itemHeight={60} renderItem={renderTrack} overscan={3} />
        )}
      </div>

      <style>{`@keyframes eq-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }`}</style>
    </div>
  );
}

  // Renderizar cada canción
  const renderTrack = (track, index) => {
    const isCurrent = currentTrack?.id === track.id;
    const isLiked = likedIds.has(track.id);

    return (
      <div
        className="flex items-center gap-3 py-2 px-4 rounded-xl cursor-pointer active:bg-white/5 transition-colors hover:bg-white/5"
        style={{ height: 60 }}
        onClick={() => onPlay(track, tracks.indexOf(track))}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden relative"
          style={{ width: 48, height: 48, background: "#282828" }}
        >
          {track.cover ? (
            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <Music2 size={18} style={{ color: "#535353" }} />
          )}
          {isCurrent && isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
              <div className="flex items-end gap-0.5 h-4">
                {[0, 1, 2].map((b) => (
                  <div key={b} style={{ width: 3, borderRadius: 2, background: "#1db954", animation: `eq-bar 0.8s ease-in-out ${b * 0.15}s infinite alternate`, height: [12, 8, 14][b] }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: isCurrent ? "#1db954" : "#fff" }}>
            {track.title}
          </p>
          <p className="truncate" style={{ fontSize: 12, color: "#a7a7a7" }}>
            {track.album !== "Desconocido" ? track.album : ""}
            {track.duration > 0 && <span> · {formatTime(track.duration)}</span>}
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); onLike(track.id); }}
            className="flex-shrink-0 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: isLiked ? "#1db954" : "#535353", padding: 6 }}>
            <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
          </button>
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(track); }}
              className="flex-shrink-0 rounded-full hover:bg-red-500/10 transition-colors" style={{ padding: 6 }}>
              <Trash2 size={15} style={{ color: "#ff4444" }} />
            </button>
          )}
        </div>
      </div>
    );
  };
  // Descargar todas las canciones del artista
  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      for (const track of artistTracks) {
        try {
          const response = await fetch(track.url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = track.filename || `${track.title}.mp3`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          console.error(`Error descargando ${track.title}:`, err);
        }
      }
    } finally {
      setDownloading(false);
    }
  };


