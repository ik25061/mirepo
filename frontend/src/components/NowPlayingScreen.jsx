// components/NowPlayingScreen.jsx
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, Heart, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, Music2,
  Search, Trash2, ChevronUp, Disc, User, ListMusic,
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
  const [showTrackList, setShowTrackList] = useState(true);
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

  // Obtener canciones del contexto (artista)
  let contextTracks = [];
  let contextLabel = "";
  let contextIcon = null;
  
  if (playContext && playContext.type === "artist") {
    contextTracks = allTracks.filter(t => t.artist === playContext.value);
    contextLabel = playContext.value;
    contextIcon = <User size={16} style={{ color: "#1db954" }} />;
  } else if (playContext && playContext.type === "album") {
    contextTracks = allTracks.filter(t => t.album === playContext.value);
    contextLabel = playContext.value;
    contextIcon = <Disc size={16} style={{ color: "#1db954" }} />;
  } else if (playContext && playContext.type === "genre") {
    contextTracks = allTracks.filter(t => {
      if (Array.isArray(t.genre)) return t.genre.includes(playContext.value);
      if (typeof t.genre === 'string') return t.genre.split(/[\/,]/).map(g => g.trim()).includes(playContext.value);
      return false;
    });
    contextLabel = playContext.value;
    contextIcon = <Music2 size={16} style={{ color: "#1db954" }} />;
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

  const hasContextList = contextTracks.length > 1;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "linear-gradient(180deg, #1a1a2e 0%, #0d0d0d 100%)",
        padding: "12px 16px 0 16px",
      }}
    >
      {/* Top bar - BOTÓN DE MINIMIZAR MEJORADO PARA TV */}
      <div className="flex items-center justify-between" style={{ flexShrink: 0 }}>
        <button 
          onClick={onClose} 
          className="p-3 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          style={{ 
            minWidth: 48, 
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ChevronDown size={28} style={{ color: "#fff" }} />
        </button>
        <div className="text-center">
          <p style={{ fontSize: 11, color: "#a7a7a7", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
            Reproduciendo ahora
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 12 }}>
          {onSync && (
            <button
              onClick={(e) => { e.stopPropagation(); onSync(track); }}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Sincronizar metadatos"
              style={{ color: "#a7a7a7", minWidth: 40, minHeight: 40 }}
            >
              <Search size={20} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(track); }}
              className="p-2 rounded-full hover:bg-red-500/20 transition-colors"
              title="Eliminar canción"
              style={{ color: "#ff4444", minWidth: 40, minHeight: 40 }}
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Área principal */}
      <div
        className="flex-1 flex flex-col"
        style={{
          minHeight: 0,
          justifyContent: hasContextList ? "flex-start" : "center",
        }}
      >
        {/* Contenedor centrado de info de canción + controles */}
        <div
          className="flex flex-col"
          style={{
            flexShrink: 0,
            paddingTop: hasContextList ? 4 : 0,
          }}
        >
          {/* Cover */}
          <div className="flex items-center justify-center" style={{ padding: hasContextList ? "4px 0" : "8px 0" }}>
            <div
              className="relative flex items-center justify-center overflow-hidden"
              style={{
                width: hasContextList ? "min(40vw, 160px)" : "min(65vw, 240px)",
                height: hasContextList ? "min(40vw, 160px)" : "min(65vw, 240px)",
                borderRadius: "12px",
                background: "#282828",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            >
              {track.cover ? (
                <img
                  src={track.cover}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music2 size={hasContextList ? 48 : 80} style={{ color: "#535353" }} />
              )}
            </div>
          </div>

          {/* Track info */}
          <div className="flex items-center justify-between" style={{ padding: "8px 0 4px 0" }}>
            <div className="min-w-0 flex-1">
              <h2 className="text-white truncate" style={{ fontSize: 20, fontWeight: 700 }}>
                {track.title}
              </h2>
              <p className="truncate" style={{ fontSize: 15, color: "#a7a7a7" }}>
                {track.artist}
              </p>
              {track.album && track.album !== "Desconocido" && (
                <p className="truncate" style={{ fontSize: 13, color: "#727272" }}>
                  {track.album}
                </p>
              )}
            </div>
            <button
              onClick={() => onLike(track.id)}
              className="ml-3 flex-shrink-0 p-2 hover:scale-110 transition-transform"
              style={{ color: isLiked ? "#1db954" : "#a7a7a7" }}
            >
              <Heart size={26} fill={isLiked ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ padding: "4px 0" }}>
            <div
              ref={progressRef}
              onClick={seekTo}
              className="w-full rounded-full cursor-pointer"
              style={{ height: 5, background: "#535353", position: "relative" }}
            >
              <div
                className="rounded-full"
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "#1db954",
                  position: "relative",
                }}
              />
            </div>
            <div className="flex justify-between" style={{ marginTop: 2 }}>
              <span style={{ fontSize: 11, color: "#a7a7a7" }}>{formatTime(currentTime)}</span>
              <span style={{ fontSize: 11, color: "#a7a7a7" }}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-between" style={{ padding: "8px 0" }}>
            <button
              onClick={() => setShuffle(!shuffle)}
              style={{ color: shuffle ? "#1db954" : "#a7a7a7", padding: 8 }}
            >
              <Shuffle size={22} />
            </button>

            <button onClick={onPrev} style={{ color: "#fff", padding: "4px 12px" }}>
              <SkipBack size={30} fill="currentColor" />
            </button>

            <button
              onClick={onPlayPause}
              className="flex items-center justify-center rounded-full hover:scale-105 transition-transform"
              style={{
                width: 64,
                height: 64,
                background: "#fff",
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}
            >
              {isPlaying ? (
                <Pause size={28} fill="#000" style={{ color: "#000" }} />
              ) : (
                <Play size={28} fill="#000" style={{ color: "#000", marginLeft: 2 }} />
              )}
            </button>

            <button onClick={onNext} style={{ color: "#fff", padding: "4px 12px" }}>
              <SkipForward size={30} fill="currentColor" />
            </button>

            <button
              onClick={() => setRepeat(!repeat)}
              style={{ color: repeat ? "#1db954" : "#a7a7a7", padding: 8 }}
            >
              <Repeat size={22} />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3" style={{ padding: "4px 0 8px 0", flexShrink: 0 }}>
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
              style={{ 
                accentColor: "#1db954",
                height: 4,
                borderRadius: 2,
              }}
            />
          </div>
        </div>

        {/* Lista de canciones */}
        {hasContextList && (
          <div 
            className="flex-1 flex flex-col" 
            style={{ 
              marginTop: 0,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              minHeight: 0,
            }}
          >
            {/* Header de la lista */}
            <button
              onClick={() => setShowTrackList(!showTrackList)}
              className="flex items-center justify-between w-full py-2 hover:bg-white/5 transition-colors rounded-lg flex-shrink-0"
              style={{ color: "#a7a7a7" }}
            >
              <div className="flex items-center gap-2">
                <ListMusic size={16} style={{ color: "#1db954" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {contextTracks.length} canciones
                </span>
                {playContext && (
                  <span style={{ fontSize: 12, color: "#727272" }}>
                    • {contextLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 12, color: "#727272" }}>
                  {showTrackList ? "Ocultar" : "Ver todas"}
                </span>
                {showTrackList ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </div>
            </button>

            {/* Lista de canciones */}
            {showTrackList && (
              <div 
                className="flex-1 flex flex-col"
                style={{ 
                  overflow: "hidden",
                  paddingTop: 4,
                }}
              >
                {contextTracks.map((ctxTrack, idx) => {
                  const isActive = ctxTrack.id === track.id;
                  const ctxIndexInTracks = allTracks.findIndex(t => t.id === ctxTrack.id);
                  const trackDuration = ctxTrack.duration || 0;
                  const durationStr = trackDuration > 0 ? formatTime(trackDuration) : "";
                  
                  return (
                    <button
                      key={ctxTrack.id}
                      onClick={() => {
                        if (!isActive) {
                          onPlay(ctxTrack, ctxIndexInTracks >= 0 ? ctxIndexInTracks : idx, playContext);
                        }
                      }}
                      className="flex items-center gap-3 w-full text-left px-2 py-1.5 hover:bg-white/5 transition-colors rounded-lg flex-shrink-0"
                      style={{
                        background: isActive ? "rgba(29,185,84,0.1)" : "transparent",
                        borderLeft: isActive ? "2px solid #1db954" : "2px solid transparent",
                        paddingLeft: isActive ? 10 : 12,
                      }}
                    >
                      <span 
                        style={{ 
                          fontSize: 12, 
                          color: isActive ? "#1db954" : "#535353",
                          fontWeight: isActive ? 700 : 400,
                          minWidth: 20,
                          textAlign: "right",
                        }}
                      >
                        {isActive ? "▶" : idx + 1}
                      </span>
                      
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate"
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? "#1db954" : "#fff",
                          }}
                        >
                          {ctxTrack.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="truncate" style={{ fontSize: 11, color: "#727272" }}>
                            {ctxTrack.artist}
                          </span>
                          {durationStr && (
                            <span style={{ fontSize: 11, color: "#535353" }}>
                              • {durationStr}
                            </span>
                          )}
                        </div>
                      </div>

                      {isActive && isPlaying && (
                        <div className="flex items-end gap-0.5 h-4 flex-shrink-0">
                          {[0, 1, 2].map((b) => (
                            <div
                              key={b}
                              style={{
                                width: 2.5,
                                borderRadius: 1,
                                background: "#1db954",
                                animation: `eq-bar 0.6s ease-in-out ${b * 0.15}s infinite alternate`,
                                height: [8, 5, 10][b],
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {isActive && !isPlaying && (
                        <Pause size={14} style={{ color: "#1db954", flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes eq-bar {
          from { transform: scaleY(0.3); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}