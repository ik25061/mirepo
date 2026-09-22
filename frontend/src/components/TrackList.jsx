// components/TrackList.jsx
import { Play, Heart, Music2, Clock, Search, Trash2 } from "lucide-react";

function formatTime(s) {
  if (!isFinite(s) || s === 0) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function TrackList({ tracks, currentTrack, isPlaying, likedIds, onPlay, onLike, onDelete, onSync }) {
  if (tracks.length === 0) return null;

  return (
    <div className="w-full">
      <div
        className="grid items-center px-4 py-2 border-b border-border"
        style={{ gridTemplateColumns: "40px 1fr 1fr 40px 60px 80px", gap: 12, fontSize: 12, color: "#a7a7a7", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
      >
        <span>#</span>
        <span>Título</span>
        <span>Álbum</span>
        <span><Heart size={14} /></span>
        <span style={{ textAlign: "right" }}><Clock size={14} /></span>
        <span style={{ textAlign: "center" }}>Acciones</span>
      </div>

      {tracks.map((track, i) => {
        const isCurrent = currentTrack?.id === track.id;
        const isLiked = likedIds.has(track.id);

        return (
          <div
            key={track.id}
            onDoubleClick={() => onPlay(track, i)}
            className={`grid items-center px-4 py-2 rounded-md cursor-pointer group transition-colors ${
              isCurrent ? "bg-secondary" : "hover:bg-secondary/50"
            }`}
            style={{ gridTemplateColumns: "40px 1fr 1fr 40px 60px 80px", gap: 12 }}
          >
            <div className="flex items-center justify-center w-6 h-6 relative">
              <span
                className={`group-hover:hidden ${isCurrent ? "text-primary" : "text-muted-foreground"}`}
                style={{ fontSize: 13 }}
              >
                {isCurrent && isPlaying ? (
                  <span className="text-primary">▶</span>
                ) : (
                  i + 1
                )}
              </span>
              <button
                className="hidden group-hover:flex items-center justify-center text-white"
                onClick={() => onPlay(track, i)}
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex-shrink-0 flex items-center justify-center rounded"
                style={{ width: 40, height: 40, background: "#282828" }}
              >
                {track.cover ? (
                  <img src={track.cover} alt={track.title} className="w-full h-full object-cover rounded" />
                ) : (
                  <Music2 size={16} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`truncate ${isCurrent ? "text-primary" : "text-white"}`}
                  style={{ fontSize: 14, fontWeight: 500 }}
                >
                  {track.title}
                </p>
                <p className="text-muted-foreground truncate" style={{ fontSize: 12 }}>
                  {track.artist}
                </p>
              </div>
            </div>

            <p className="text-muted-foreground truncate" style={{ fontSize: 13 }}>
              {track.album}
            </p>

            <button
              onClick={(e) => { e.stopPropagation(); onLike(track.id); }}
              className={`flex items-center justify-center transition-colors ${
                isLiked ? "text-primary" : "text-transparent group-hover:text-muted-foreground hover:!text-white"
              }`}
            >
              <Heart size={15} fill={isLiked ? "currentColor" : "none"} />
            </button>

            <p className="text-muted-foreground" style={{ fontSize: 13, textAlign: "right" }}>
              {formatTime(track.duration)}
            </p>

            <div className="flex items-center justify-center gap-1">
              {onSync && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSync(track); }}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  title="Sincronizar metadatos"
                >
                  <Search size={14} style={{ color: "#a7a7a7" }} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(track); }}
                  className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                  title="Eliminar canción"
                >
                  <Trash2 size={14} style={{ color: "#ff4444" }} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}