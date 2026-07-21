/**
 * ============================================================
 * SYNC NOTIFICATION - NOTIFICACIÓN DE SINCRONIZACIÓN
 * ============================================================
 * 
 * Muestra un toast animado cuando se está sincronizando
 * los likes/dislikes offline con el servidor. Cada canción
 * aparece con un icono de subida animado.
 */

import { useEffect, useState, useRef } from 'react';
import { Upload, CheckCircle2, Wifi } from 'lucide-react';

function SyncItem({ songName, index, total, isActive }) {
  return (
    <div
      className={`flex items-center gap-2 transition-all duration-300 ease-in-out ${
        isActive
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 -translate-x-4 absolute'
      }`}
      style={{
        position: isActive ? 'relative' : 'absolute',
        pointerEvents: 'none',
      }}
    >
      <div className="relative flex items-center justify-center w-5 h-5">
        {isActive ? (
          <>
            <Upload
              size={14}
              className="text-primary"
              style={{
                animation: 'syncUpload 1s ease-in-out infinite',
              }}
            />
            <span
              className="absolute inset-0 rounded-full border-2 border-primary"
              style={{
                animation: 'syncPing 1.5s ease-in-out infinite',
              }}
            />
          </>
        ) : (
          <CheckCircle2 size={14} className="text-primary/50" />
        )}
      </div>
      <span
        className={`text-xs truncate max-w-[160px] sm:max-w-[200px] ${
          isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
        }`}
      >
        {isActive ? 'Subiendo: ' : '✓ '}
        {songName}
      </span>
      {isActive && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {index}/{total}
        </span>
      )}
    </div>
  );
}

export default function SyncNotification({
  isOnline,
  isSyncing,
  syncingSongs,  // Array de { songId, songName }
  lastSync,
  pendingCount,
}) {
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const [animatingSongs, setAnimatingSongs] = useState([]);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const prevSyncingRef = useRef(false);

  // Detectar inicio/fin de sincronización
  useEffect(() => {
    const wasSyncing = prevSyncingRef.current;
    const isNowSyncing = isSyncing && isOnline && syncingSongs.length > 0;
    
    // Si empezó a sincronizar
    if (!wasSyncing && isNowSyncing) {
      setVisible(true);
      setShowComplete(false);
      setCurrentIndex(0);
      setAnimatingSongs(syncingSongs);
      
      // Animación: mostrar cada canción una por una
      let idx = 0;
      setCurrentIndex(0);
      
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        idx++;
        if (idx < syncingSongs.length) {
          setCurrentIndex(idx);
        } else {
          clearInterval(intervalRef.current);
          // Mostrar completado
          setShowComplete(true);
          timeoutRef.current = setTimeout(() => {
            setVisible(false);
          }, 2000);
        }
      }, 800); // 800ms por canción
    }
    
    // Si terminó de sincronizar
    if (wasSyncing && !isNowSyncing && syncingSongs.length === 0 && pendingCount === 0) {
      clearInterval(intervalRef.current);
      if (!showComplete) {
        setShowComplete(true);
        timeoutRef.current = setTimeout(() => {
          setVisible(false);
        }, 2000);
      }
    }
    
    prevSyncingRef.current = isNowSyncing;
    
    // Limpiar al desmontar
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [isSyncing, isOnline, syncingSongs, pendingCount, showComplete]);

  // Si no hay nada que mostrar, no renderizar
  if (!visible && !isSyncing) return null;

  const totalItems = animatingSongs.length;

  return (
    <div
      className={`fixed top-2 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-400 ease-in-out ${
        visible || isSyncing
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}
      style={{ maxWidth: '90vw' }}
    >
      <div className="flex flex-col gap-1 rounded-xl border border-primary/30 bg-surface/95 backdrop-blur-md px-4 py-3 shadow-2xl shadow-primary/10 min-w-[220px] sm:min-w-[280px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Wifi size={12} className="text-primary" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
              {showComplete ? 'SINCRONIZADO' : 'SINCRONIZANDO'}
            </span>
          </div>
          {!showComplete && totalItems > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {currentIndex + 1}/{totalItems}
            </span>
          )}
        </div>

        {/* Lista animada de canciones */}
        <div className="relative overflow-hidden" style={{ minHeight: 24 }}>
          {totalItems > 0 ? (
            animatingSongs.map((song, i) => (
              <SyncItem
                key={`${song.songId}-${i}`}
                songName={song.songName}
                index={i + 1}
                total={totalItems}
                isActive={i === currentIndex && !showComplete}
              />
            ))
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-5 h-5">
                <Upload
                  size={14}
                  className="text-primary"
                  style={{ animation: 'syncUpload 1s ease-in-out infinite' }}
                />
                <span
                  className="absolute inset-0 rounded-full border-2 border-primary"
                  style={{ animation: 'syncPing 1.5s ease-in-out infinite' }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                Preparando sincronización...
              </span>
            </div>
          )}

          {/* Estado completado */}
          {showComplete && (
            <div className="flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={14} className="text-primary" />
              <span className="text-xs text-foreground font-medium">
                {totalItems > 0
                  ? `${totalItems} ${totalItems === 1 ? 'cambio' : 'cambios'} sincronizado${totalItems === 1 ? '' : 's'}`
                  : 'Cambios sincronizados'}
              </span>
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        {totalItems > 0 && !showComplete && (
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(100, ((currentIndex + 1) / totalItems) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}