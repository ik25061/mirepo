// components/NowPlayingScreen.jsx
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, Heart, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, Music2,
  Search, Trash2,
} from "lucide-react";

function formatTime(s) {
  if (!isFinite(s) || s === 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function NowPlayingScreen({
  track, isPlaying, onPlayPause, onNext, onPrev, onLike, likedIds, audioRef, onClose,
  onSync, onDelete,
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoad = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoad);
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoad);
    };
  }, [audioRef]);

  const seekTo = (e) => {
    const bar = progressRef.current;
    if (!bar || !audioRef.current || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLiked = track ? likedIds.has(track.id) : false;

  if (!track) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ background: "#0d0d0d" }}
      >
        <Music2 size={64} style={{ color: "#535353" }} />
        <p className="mt-4" style={{ color: "#a7a7a7", fontSize: 16 }}>
          Sin reproducción activa
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "linear-gradient(180deg, #2d1b4e 0%, #1a1a2e 40%, #0d0d0d 100%)",
        padding: "16px 20px 20px 20px",
      }}
    >
      {/* Top bar - SIN tres puntos */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <button onClick={onClose} className="p-2 -ml-2">
          <ChevronDown size={24} style={{ color: "#fff" }} />
        </button>
        <div className="text-center">
          <p style={{ fontSize: 11, color: "#a7a7a7", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
            Reproduciendo ahora
          </p>
        </div>
        {/* Botones con más separación */}
        <div className="flex items-center" style={{ gap: 16 }}>
          {onSync && (
            <button
              onClick={(e) => { e.stopPropagation(); onSync(track); }}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Sincronizar metadatos con MusicBrainz"
              style={{ color: "#a7a7a7" }}
            >
              <Search size={22} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(track); }}
              className="p-2 rounded-full hover:bg-red-500/20 transition-colors"
              title="Eliminar canción"
              style={{ color: "#ff4444" }}
            >
              <Trash2 size={22} />
            </button>
          )}
        </div>
      </div>

      {/* Album art */}
      <div className="flex items-center justify-center" style={{ padding: "12px 0" }}>
        <div
          className="relative flex items-center justify-center overflow-hidden"
          style={{
            width: "min(68vw, 280px)",
            height: "min(68vw, 280px)",
            borderRadius: "50%",
            background: "#282828",
            boxShadow: isPlaying
              ? "0 0 60px rgba(29,185,84,0.25), 0 20px 60px rgba(0,0,0,0.6)"
              : "0 20px 60px rgba(0,0,0,0.6)",
            transition: "box-shadow 0.5s ease",
          }}
        >
          {track.cover ? (
            <img
              src={track.cover}
              alt={track.title}
              className="w-full h-full object-cover"
              style={{
                borderRadius: "50%",
                transform: isPlaying ? "scale(1.0)" : "scale(0.92)",
                transition: "transform 0.4s ease",
              }}
            />
          ) : (
            <Music2 size={80} style={{ color: "#535353" }} />
          )}
        </div>
      </div>

      {/* Track info + like */}
      <div className="flex items-center justify-between" style={{ padding: "8px 0" }}>
        <div className="min-w-0 flex-1">
          <h2 className="text-white truncate" style={{ fontSize: 20, fontWeight: 700 }}>
            {track.title}
          </h2>
          <p className="truncate" style={{ fontSize: 14, color: "#a7a7a7", marginTop: 2 }}>
            {track.artist}
          </p>
        </div>
        <button
          onClick={() => onLike(track.id)}
          className="ml-4 flex-shrink-0 p-2"
          style={{ color: isLiked ? "#1db954" : "#a7a7a7" }}
        >
          <Heart size={24} fill={isLiked ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "8px 0" }}>
        <div
          ref={progressRef}
          onClick={seekTo}
          className="w-full rounded-full cursor-pointer"
          style={{ height: 4, background: "#535353", position: "relative" }}
        >
          <div
            className="rounded-full"
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "#1db954",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
          </div>
        </div>
        <div className="flex justify-between" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "#a7a7a7" }}>{formatTime(currentTime)}</span>
          <span style={{ fontSize: 11, color: "#a7a7a7" }}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main controls */}
      <div className="flex items-center justify-between" style={{ padding: "12px 8px" }}>
        <button
          onClick={() => setShuffle(!shuffle)}
          style={{ color: shuffle ? "#1db954" : "#a7a7a7" }}
        >
          <Shuffle size={22} />
        </button>

        <button onClick={onPrev} style={{ color: "#fff", padding: "4px 8px" }}>
          <SkipBack size={32} fill="currentColor" />
        </button>

        <button
          onClick={onPlayPause}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 68,
            height: 68,
            background: "#fff",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {isPlaying ? (
            <Pause size={28} fill="#000" style={{ color: "#000" }} />
          ) : (
            <Play size={28} fill="#000" style={{ color: "#000", marginLeft: 3 }} />
          )}
        </button>

        <button onClick={onNext} style={{ color: "#fff", padding: "4px 8px" }}>
          <SkipForward size={32} fill="currentColor" />
        </button>

        <button
          onClick={() => setRepeat(!repeat)}
          style={{ color: repeat ? "#1db954" : "#a7a7a7" }}
        >
          <Repeat size={22} />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3" style={{ padding: "8px 4px 4px 4px" }}>
        <Volume2 size={16} style={{ color: "#a7a7a7", flexShrink: 0 }} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.8}
          onChange={(e) => {
            if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value);
          }}
          className="flex-1"
          style={{ accentColor: "#1db954" }}
        />
      </div>
    </div>
  );
}