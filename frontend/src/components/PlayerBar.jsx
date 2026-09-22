// components/PlayerBar.jsx
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Heart,
  Music2,
} from "lucide-react";

function formatTime(s) {
  if (!isFinite(s) || s === 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PlayerBar({
  track,
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  onLike,
  likedIds,
  audioRef,
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoad = () => setDuration(audio.duration);
    const onEnded = () => { 
      if (repeat) { 
        audio.currentTime = 0; 
        audio.play(); 
      } else { 
        onNext(); 
      } 
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoad);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoad);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioRef, onNext, repeat]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted, audioRef]);

  const seekTo = (e) => {
    const bar = progressRef.current;
    if (!bar || !audioRef.current) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * duration;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLiked = track ? likedIds.has(track.id) : false;

  return (
    <div
      className="flex items-center justify-between px-4"
      style={{
        height: 90,
        background: "#181818",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        gap: 16,
      }}
    >
      {/* Track info */}
      <div className="flex items-center gap-3 min-w-0" style={{ flex: "0 0 280px" }}>
        <div
          className="flex items-center justify-center rounded flex-shrink-0"
          style={{ width: 56, height: 56, background: "#282828" }}
        >
          {track?.cover ? (
            <img src={track.cover} alt={track.title} className="w-full h-full object-cover rounded" />
          ) : (
            <Music2 size={22} className="text-muted-foreground" />
          )}
        </div>
        {track ? (
          <div className="min-w-0">
            <p className="text-white truncate" style={{ fontSize: 14, fontWeight: 600 }}>{track.title}</p>
            <p className="text-muted-foreground truncate" style={{ fontSize: 12 }}>{track.artist}</p>
          </div>
        ) : (
          <div>
            <p className="text-muted-foreground" style={{ fontSize: 13 }}>Sin reproducción</p>
          </div>
        )}
        {track && (
          <button
            onClick={() => onLike(track.id)}
            className={`ml-2 flex-shrink-0 transition-colors ${
              isLiked ? "text-primary" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2" style={{ flex: 1, maxWidth: 640 }}>
        <div className="flex items-center gap-6">
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`transition-colors ${
              shuffle ? "text-primary" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={onPrev}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <SkipBack size={22} />
          </button>
          <button
            onClick={onPlayPause}
            disabled={!track}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying ? (
              <Pause size={18} className="text-black" fill="black" />
            ) : (
              <Play size={18} className="text-black ml-0.5" fill="black" />
            )}
          </button>
          <button
            onClick={onNext}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <SkipForward size={22} />
          </button>
          <button
            onClick={() => setRepeat(!repeat)}
            className={`transition-colors ${
              repeat ? "text-primary" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Repeat size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-muted-foreground" style={{ fontSize: 11, minWidth: 36, textAlign: "right" }}>
            {formatTime(currentTime)}
          </span>
          <div
            ref={progressRef}
            onClick={seekTo}
            className="flex-1 h-1 rounded-full cursor-pointer group"
            style={{ background: "#535353" }}
          >
            <div
              className="h-full rounded-full relative transition-all"
              style={{ width: `${progress}%`, background: "#1db954" }}
            >
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ transform: "translate(50%, -50%)" }}
              />
            </div>
          </div>
          <span className="text-muted-foreground" style={{ fontSize: 11, minWidth: 36 }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2" style={{ flex: "0 0 180px", justifyContent: "flex-end" }}>
        <button
          onClick={() => setMuted(!muted)}
          className="text-muted-foreground hover:text-white transition-colors"
        >
          {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => { 
            setVolume(parseFloat(e.target.value)); 
            setMuted(false); 
          }}
          className="w-24 accent-primary cursor-pointer"
          style={{ accentColor: "#1db954" }}
        />
      </div>
    </div>
  );
}