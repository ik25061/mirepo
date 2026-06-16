// components/MobileSearchView.jsx
import { useState, useRef, useCallback } from "react";
import { Search, Music2, Play, Mic, MicOff, Loader2, X } from "lucide-react";

const API_URL = 'http://172.16.12.4:5000';

export function MobileSearchView({ tracks, currentTrack, onPlay }) {
  const [query, setQuery] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const results = query.trim()
    ? tracks.filter(
        (t) =>
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.artist.toLowerCase().includes(query.toLowerCase()) ||
          t.album.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const startRecording = useCallback(async () => {
    try {
      setRecognitionResult(null);
      setQuery("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(timerRef.current);
        setRecordingTime(0);

        if (chunksRef.current.length === 0) return;

        setIsRecognizing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");

          const response = await fetch(`${API_URL}/api/recognize`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) throw new Error("Error en el reconocimiento");

          const data = await response.json();
          setRecognitionResult(data);
        } catch (err) {
          console.error("Error reconociendo canción:", err);
          setRecognitionResult({ error: "Error al reconocer la canción" });
        } finally {
          setIsRecognizing(false);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 10) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Error accediendo al micrófono:", err);
      alert("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleMicToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const playRecognizedTrack = useCallback(
    (track) => {
      const trackIndex = tracks.findIndex((t) => t.id === track.id || t.filename === track.filename);
      if (trackIndex !== -1) {
        onPlay(tracks[trackIndex], trackIndex);
      }
    },
    [tracks, onPlay]
  );

  const clearRecognition = useCallback(() => {
    setRecognitionResult(null);
    setQuery("");
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "#121212" }}>
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-white mb-4" style={{ fontSize: 22, fontWeight: 800 }}>
          Buscar
        </h1>

        {/* Barra de búsqueda + botón micrófono */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl flex-1"
            style={{ background: "#282828" }}
          >
            <Search size={16} style={{ color: "#a7a7a7", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Artistas, canciones, álbumes..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (recognitionResult) setRecognitionResult(null);
              }}
              className="flex-1 bg-transparent text-white outline-none"
              style={{ fontSize: 15 }}
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="p-1"
                style={{ color: "#a7a7a7" }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Botón de micrófono */}
          <button
            onClick={handleMicToggle}
            disabled={isRecognizing}
            className="flex items-center justify-center rounded-full transition-all"
            style={{
              width: 44,
              height: 44,
              background: isRecording
                ? "#e74c3c"
                : isRecognizing
                ? "#535353"
                : "#1db954",
              flexShrink: 0,
              boxShadow: isRecording
                ? "0 0 20px rgba(231,76,60,0.5)"
                : "none",
            }}
          >
            {isRecognizing ? (
              <Loader2 size={18} style={{ color: "#fff" }} className="animate-spin" />
            ) : isRecording ? (
              <MicOff size={18} style={{ color: "#fff" }} />
            ) : (
              <Mic size={18} style={{ color: "#fff" }} />
            )}
          </button>
        </div>

        {/* Indicador de grabación */}
        {isRecording && (
          <div
            className="flex items-center justify-center gap-2 mt-3 py-2 rounded-lg"
            style={{ background: "rgba(231,76,60,0.15)" }}
          >
            <div
              className="rounded-full animate-pulse"
              style={{
                width: 8,
                height: 8,
                background: "#e74c3c",
              }}
            />
            <span style={{ fontSize: 13, color: "#e74c3c", fontWeight: 600 }}>
              Escuchando... {recordingTime}s / 10s
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {/* Resultado de reconocimiento */}
        {recognitionResult && !recognitionResult.error && recognitionResult.recognized && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 13, color: "#1db954", fontWeight: 600 }}>
                🎤 Canción reconocida
              </p>
              <button
                onClick={clearRecognition}
                className="p-1 rounded-full hover:bg-white/10"
                style={{ color: "#a7a7a7" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Canción reconocida */}
            <div
              className="rounded-xl p-3 mb-3"
              style={{ background: "#1a1a2e", border: "1px solid #1db95433" }}
            >
              <div className="flex items-center gap-3">
                {recognitionResult.recognized.imageUrl ? (
                  <img
                    src={recognitionResult.recognized.imageUrl}
                    alt={recognitionResult.recognized.title}
                    className="rounded-lg"
                    style={{ width: 52, height: 52, objectFit: "cover" }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: 52,
                      height: 52,
                      background: "#282828",
                    }}
                  >
                    <Music2 size={20} style={{ color: "#535353" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate"
                    style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}
                  >
                    {recognitionResult.recognized.title}
                  </p>
                  <p
                    className="truncate"
                    style={{ fontSize: 13, color: "#a7a7a7" }}
                  >
                    {recognitionResult.recognized.artist}
                  </p>
                  {recognitionResult.recognized.album && (
                    <p
                      className="truncate"
                      style={{ fontSize: 11, color: "#727272" }}
                    >
                      {recognitionResult.recognized.album}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Coincidencia en biblioteca */}
            {recognitionResult.matchedTrack ? (
              <div
                onClick={() => playRecognizedTrack(recognitionResult.matchedTrack)}
                className="flex items-center gap-3 py-2 px-2 rounded-xl cursor-pointer active:bg-white/5"
                style={{ background: "#1db95410" }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
                  style={{ width: 52, height: 52, background: "#282828" }}
                >
                  {recognitionResult.matchedTrack.cover ? (
                    <img
                      src={recognitionResult.matchedTrack.cover}
                      alt={recognitionResult.matchedTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music2 size={20} style={{ color: "#535353" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 11, color: "#1db954", fontWeight: 600, marginBottom: 2 }}>
                    ▶ EN TU BIBLIOTECA
                  </p>
                  <p
                    className="truncate"
                    style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}
                  >
                    {recognitionResult.matchedTrack.title}
                  </p>
                  <p
                    className="truncate"
                    style={{ fontSize: 12, color: "#a7a7a7" }}
                  >
                    {recognitionResult.matchedTrack.artist}
                  </p>
                </div>
                <Play size={18} style={{ color: "#1db954", flexShrink: 0 }} />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#727272", textAlign: "center", padding: "8px 0" }}>
                No se encontró en tu biblioteca local
              </p>
            )}
          </div>
        )}

        {/* Error de reconocimiento */}
        {recognitionResult?.error && (
          <div
            className="flex items-center justify-between mb-4 py-3 px-4 rounded-xl"
            style={{ background: "rgba(231,76,60,0.1)" }}
          >
            <p style={{ fontSize: 13, color: "#e74c3c" }}>
              ❌ {recognitionResult.error}
            </p>
            <button
              onClick={clearRecognition}
              className="p-1"
              style={{ color: "#a7a7a7" }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Búsqueda de texto */}
        {query.trim() === "" && !recognitionResult ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search size={48} style={{ color: "#535353", marginBottom: 12 }} />
            <p
              className="text-white mb-1"
              style={{ fontSize: 15, fontWeight: 600 }}
            >
              Encuentra tu música
            </p>
            <p style={{ fontSize: 13, color: "#a7a7a7", marginBottom: 16 }}>
              Busca por canción, artista o álbum
            </p>
            <div
              className="flex items-center gap-2 py-2 px-4 rounded-full"
              style={{ background: "#1db95420", border: "1px solid #1db95440" }}
            >
              <Mic size={14} style={{ color: "#1db954" }} />
              <p style={{ fontSize: 12, color: "#1db954" }}>
                O presiona el micrófono para identificar una canción
              </p>
            </div>
          </div>
        ) : query.trim() !== "" && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p
              className="text-white mb-1"
              style={{ fontSize: 15, fontWeight: 600 }}
            >
              Sin resultados
            </p>
            <p style={{ fontSize: 13, color: "#a7a7a7" }}>
              No se encontró "{query}" en tu biblioteca
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-4">
            {results.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => onPlay(track, tracks.indexOf(track))}
                  className="flex items-center gap-3 py-2 px-2 rounded-xl cursor-pointer active:bg-white/5"
                >
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
                    style={{ width: 52, height: 52, background: "#282828" }}
                  >
                    {track.cover ? (
                      <img
                        src={track.cover}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music2 size={20} style={{ color: "#535353" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isCurrent ? "#1db954" : "#fff",
                      }}
                    >
                      {track.title}
                    </p>
                    <p
                      className="truncate"
                      style={{ fontSize: 12, color: "#a7a7a7" }}
                    >
                      {track.artist} · {track.album}
                    </p>
                  </div>
                  <Play size={18} style={{ color: "#a7a7a7", flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}