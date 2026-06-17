// components/NowPlayingScreen.jsx
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, Heart, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, Music2,
  Search, Trash2, ChevronUp, Disc, User,
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
  allTracks = [], playContext, onPlay, currentQueueIndex,
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [showTrackList, setShowTrackList] = useState(false);
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

  // Obtener canciones del contexto (artista o género)
  let contextTracks = [];
  let contextLabel = "";
  if (playContext && playContext.type === "artist") {
    contextTracks = allTracks.filter(t => t.artist === playContext.value);
    contextLabel = playContext.value;
  } else if (playContext && playContext.type === "genre") {
    contextTracks = allTracks.filter(t => {
      if (Array.isArray(t.genre)) return t.genre.includes(playContext.value);
      if (typeof t.genre === 'string') return t.genre.split(/[\/,]/).map(g => g.trim()).includes(playContext.value);
      return false;
    });
    contextLabel = playContext.value;
  }

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
      {/* Top bar */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <button onClick={onClose} className="p-2 -ml-2">
          <ChevronDown size={24} style={{ color: "#fff" }} />
        </button>
        <div className="text-center">
          <p style={{ fontSize: 11, color: "#a7a7a7", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
            {playContext ? `${playContext.type === 'artist' ? 'Artista' : 'Género'}` : "Reproduciendo ahora"}
          </p>
          {playContext && (
            <p style={{ fontSize: 12, color: "#1db954", fontWeight: 600, marginTop: 1 }}>
              {contextLabel}
            </p>
          )}
        </div>
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
          {(track.album && track.album !== "Desconocido") || track.year ? (
            <p className="truncate" style={{ fontSize: 12, color: "#727272", marginTop: 1 }}>
              {track.album && track.album !== "Desconocido" ? track.album : ""}
              {track.year ? ` • ${track.year}` : ""}
            </p>
          ) : null}
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

      {/* Flecha para mostrar lista de canciones del contexto (artista/género) */}
      {contextTracks.length > 1 && (
        <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
          <button
            onClick={() => setShowTrackList(!showTrackList)}
            className="flex items-center justify-center w-full gap-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "#a7a7a7", fontSize: 13 }}
          >
            {showTrackList ? (
              <>
                <ChevronUp size={16} />
                Ocultar lista
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                {contextTracks.length} canciones{playContext?.type === 'artist' ? ` de ${contextLabel}` : ` de ${contextLabel}`}
              </>
            )}
          </button>

          {showTrackList && (
            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                marginTop: 8,
                borderRadius: 12,
                background: "rgba(0,0,0,0.3)",
                padding: "4px 0",
              }}
            >
              {contextTracks.map((ctxTrack, idx) => {
                const isActive = ctxTrack.id === track.id;
                const ctxIndexInTracks = allTracks.findIndex(t => t.id === ctxTrack.id);
                return (
                  <button
                    key={ctxTrack.id}
                    onClick={() => {
                      if (!isActive) {
                        onPlay(ctxTrack, ctxIndexInTracks >= 0 ? ctxIndexInTracks : idx, playContext);
                      }
                    }}
                    className="flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-white/5 transition-colors"
                    style={{
                      background: isActive ? "rgba(29,185,84,0.15)" : "transparent",
                    }}
                  >
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded overflow-hidden"
                      style={{ width: 36, height: 36, background: "#282828" }}
                    >
                      {ctxTrack.cover ? (
                        <img src={ctxTrack.cover} alt="" className="w-full h-full object-cover" />
                      ) : playContext?.type === "artist" ? (
                        <User size={16} style={{ color: "#535353" }} />
                      ) : (
                        <Disc size={16} style={{ color: "#535353" }} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isActive ? "#1db954" : "#fff",
                        }}
                      >
                        {ctxTrack.title}
                      </p>
                      {playContext?.type !== "artist" && (
                        <p className="truncate" style={{ fontSize: 11, color: "#727272" }}>
                          {ctxTrack.artist}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <Play size={12} fill="#1db954" style={{ color: "#1db954", flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}