/**
 * ============================================================
 * LYRICS VIEWER - VISOR DE LETRAS DE CANCIONES
 * ============================================================
 * 
 * Muestra la letra de la canción con traducción opcional.
 * Las letras se cargan bajo demanda y se almacenan en caché.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Languages, RefreshCw, Loader2, Music2 } from 'lucide-react';
import { api } from '../lib/api.js';

export default function LyricsViewer({ song, onClose }) {
  const [lyrics, setLyrics] = useState(null);
  const [translatedLyrics, setTranslatedLyrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!song) return;
    
    const loadLyrics = async () => {
      try {
        setLoading(true);
        setError(null);
        setTitle(song.title || '');
        setArtist(song.artist || '');
        
        const response = await fetch(`/api/lyrics/${song.id}`);
        const data = await response.json();
        
        if (data.success && data.hasLyrics) {
          setLyrics(data.lyrics);
          setTranslatedLyrics(data.translatedLyrics || null);
          // Si hay traducción, mostrarla por defecto si la letra no está en español
          if (data.translatedLyrics) {
            setShowTranslation(true);
          }
        } else {
          setError(data.message || 'No se encontraron letras');
        }
      } catch (err) {
        console.error('[LyricsViewer] Error:', err);
        setError('Error al cargar la letra');
      } finally {
        setLoading(false);
      }
    };
    
    loadLyrics();
  }, [song]);

  const handleRefresh = async () => {
    if (!song) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/lyrics/${song.id}/refresh`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success && data.hasLyrics) {
        setLyrics(data.lyrics);
        setTranslatedLyrics(data.translatedLyrics || null);
        if (data.translatedLyrics) {
          setShowTranslation(true);
        }
      } else {
        setError(data.message || 'No se encontraron letras');
        setLyrics(null);
        setTranslatedLyrics(null);
      }
    } catch (err) {
      console.error('[LyricsViewer] Error refrescando:', err);
      setError('Error al refrescar la letra');
    } finally {
      setLoading(false);
    }
  };

  // Renderizar letras con formato (cada línea en un párrafo)
  const renderLyrics = (text) => {
    if (!text) return null;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return lines.map((line, i) => (
      <p key={i} className="text-sm leading-relaxed text-white/90 hover:text-white transition-colors">
        {line}
      </p>
    ));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div 
        ref={containerRef}
        className="relative w-full max-w-2xl max-h-[90vh] bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a1a' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">{title}</h2>
            <p className="text-sm text-muted-foreground truncate">{artist}</p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {!loading && lyrics && (
              <button
                onClick={() => setShowTranslation(!showTranslation)}
                disabled={!translatedLyrics}
                className={`p-2 rounded-full transition-colors ${
                  showTranslation && translatedLyrics
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-white'
                } ${!translatedLyrics ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={translatedLyrics ? 'Mostrar traducción' : 'No hay traducción disponible'}
              >
                <Languages size={18} />
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 rounded-full text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
              title="Refrescar letra"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-surface to-surface/0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 size={40} className="animate-spin text-primary" />
              <p className="mt-4 text-muted-foreground">Buscando letras...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Music2 size={48} className="text-muted-foreground/40 mb-4" />
              <p className="text-white font-medium mb-2">No hay letras disponibles</p>
              <p className="text-muted-foreground text-sm max-w-xs">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-sm"
              >
                Intentar de nuevo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {showTranslation && translatedLyrics ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-3">Letra original</p>
                    <div className="space-y-1 text-white/80">
                      {renderLyrics(lyrics)}
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-4">
                    <p className="text-xs uppercase tracking-wider text-primary/60 mb-3">Traducción al español</p>
                    <div className="space-y-1 text-white/90">
                      {renderLyrics(translatedLyrics)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {renderLyrics(lyrics)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && lyrics && (
          <div className="p-4 border-t border-white/5 flex-shrink-0">
            <p className="text-xs text-muted-foreground/50 text-center">
              {translatedLyrics ? (
                showTranslation ? 'Mostrando traducción · Haz clic en 🌐 para ver original' : 'Mostrando original · Haz clic en 🌐 para ver traducción'
              ) : (
                'Letra obtenida de servicios externos'
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}