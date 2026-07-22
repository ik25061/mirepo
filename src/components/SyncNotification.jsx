/**
 * ============================================================
 * SYNC NOTIFICATION - NOTIFICACIÓN DE SINCRONIZACIÓN
 * ============================================================
 * 
 * Muestra un toast animado cuando se está sincronizando
 * los likes/dislikes offline con el servidor. Cada canción
 * aparece con un icono de subida animado.
 * 
 * También muestra la eliminación de archivos preeliminados
 * offline, indicando "Eliminando archivos preeliminados offline"
 * durante el proceso y manteniéndose visible unos segundos
 * después de completarse.
 */

import { useEffect, useState, useRef } from 'react';
import { Upload, CheckCircle2, Wifi, Trash2, FileDown } from 'lucide-react';

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

function DeleteItem({ songName, index, total, isActive }) {
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
            <Trash2
              size={14}
              className="text-danger"
              style={{
                animation: 'syncUpload 1s ease-in-out infinite',
              }}
            />
            <span
              className="absolute inset-0 rounded-full border-2 border-danger"
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
        {isActive ? 'Eliminando: ' : '✓ '}
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
  isDeleting = false,
  deletingSongs = [],  // Array de { songId, songName }
}) {
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const [animatingSongs, setAnimatingSongs] = useState([]);
  const [deleteCurrentIndex, setDeleteCurrentIndex] = useState(0);
  const [deleteShowComplete, setDeleteShowComplete] = useState(false);
  const [deleteAnimatingSongs, setDeleteAnimatingSongs] = useState([]);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const deleteIntervalRef = useRef(null);
  const deleteTimeoutRef = useRef(null);
  const prevSyncingRef = useRef(false);
  const prevDeletingRef = useRef(false);

  // Detectar inicio/fin de sincronización de likes
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
            // Solo ocultar si no hay eliminación en curso
            if (!isDeleting || deletingSongs.length === 0) {
              setVisible(false);
            }
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
          if (!isDeleting || deletingSongs.length === 0) {
            setVisible(false);
          }
        }, 2000);
      }
    }
    
    prevSyncingRef.current = isNowSyncing;
    
    // Limpiar al desmontar
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [isSyncing, isOnline, syncingSongs, pendingCount, showComplete, isDeleting, deletingSongs]);

  // Detectar inicio/fin de eliminación de archivos preeliminados
  useEffect(() => {
    const wasDeleting = prevDeletingRef.current;
    const isNowDeleting = isDeleting && isOnline && deletingSongs.length > 0;
    
    // Si empezó a eliminar
    if (!wasDeleting && isNowDeleting) {
      setVisible(true);
      setDeleteShowComplete(false);
      setDeleteCurrentIndex(0);
      setDeleteAnimatingSongs(deletingSongs);
      
      // Animación: mostrar cada canción una por una
      let idx = 0;
      setDeleteCurrentIndex(0);
      
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = setInterval(() => {
        idx++;
        if (idx < deletingSongs.length) {
          setDeleteCurrentIndex(idx);
        } else {
          clearInterval(deleteIntervalRef.current);
          // Mostrar completado
          setDeleteShowComplete(true);
          deleteTimeoutRef.current = setTimeout(() => {
            // Solo ocultar si no hay sincronización de likes en curso
            if (!isSyncing || syncingSongs.length === 0) {
              setVisible(false);
            }
          }, 2000);
        }
      }, 800); // 800ms por canción
    }
    
    // Si terminó de eliminar
    if (wasDeleting && !isNowDeleting && deletingSongs.length === 0) {
      clearInterval(deleteIntervalRef.current);
      if (!deleteShowComplete) {
        setDeleteShowComplete(true);
        deleteTimeoutRef.current = setTimeout(() => {
          if (!isSyncing || syncingSongs.length === 0) {
            setVisible(false);
          }
        }, 2000);
      }
    }
    
    prevDeletingRef.current = isNowDeleting;
    
    // Limpiar al desmontar
    return () => {
      clearInterval(deleteIntervalRef.current);
      clearTimeout(deleteTimeoutRef.current);
    };
  }, [isDeleting, isOnline, deletingSongs, isSyncing, syncingSongs, deleteShowComplete]);

  // Si no hay nada que mostrar, no renderizar
  if (!visible && !isSyncing && !isDeleting) return null;

  const totalItems = animatingSongs.length;
  const deleteTotalItems = deleteAnimatingSongs.length;
  const hasLikes = totalItems > 0 || (isSyncing && syncingSongs.length > 0);
  const hasDeletes = deleteTotalItems > 0 || (isDeleting && deletingSongs.length > 0);

  return (
    <div
      className={`fixed top-2 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-400 ease-in-out ${
        visible || isSyncing || isDeleting
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
              {showComplete && !isDeleting ? 'SINCRONIZADO' : 'SINCRONIZANDO'}
            </span>
          </div>
          {!showComplete && totalItems > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {currentIndex + 1}/{totalItems}
            </span>
          )}
        </div>

        {/* Lista animada de canciones (likes) */}
        <div className="relative overflow-hidden" style={{ minHeight: 24 }}>
          {totalItems > 0 ? (
            animatingSongs.map((song, i) => (
              <SyncItem
                key={`like-${song.songId}-${i}`}
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

          {/* Estado completado (likes) */}
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

        {/* Barra de progreso (likes) */}
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

        {/* ===== SECCIÓN DE ELIMINACIÓN DE ARCHIVOS PREELIMINADOS OFFLINE ===== */}
        {hasDeletes && (
          <>
            {/* Separador */}
            <div className="my-1 h-px w-full bg-border/30"></div>

            {/* Header de eliminación */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <FileDown size={12} className="text-danger" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-danger">
                  {deleteShowComplete ? 'ELIMINADO' : 'ELIMINANDO ARCHIVOS PREELIMINADOS OFFLINE'}
                </span>
              </div>
              {!deleteShowComplete && deleteTotalItems > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {deleteCurrentIndex + 1}/{deleteTotalItems}
                </span>
              )}
            </div>

            {/* Lista animada de eliminación */}
            <div className="relative overflow-hidden" style={{ minHeight: 24 }}>
              {deleteTotalItems > 0 ? (
                deleteAnimatingSongs.map((song, i) => (
                  <DeleteItem
                    key={`delete-${song.songId}-${i}`}
                    songName={song.songName}
                    index={i + 1}
                    total={deleteTotalItems}
                    isActive={i === deleteCurrentIndex && !deleteShowComplete}
                  />
                ))
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <Trash2
                      size={14}
                      className="text-danger"
                      style={{ animation: 'syncUpload 1s ease-in-out infinite' }}
                    />
                    <span
                      className="absolute inset-0 rounded-full border-2 border-danger"
                      style={{ animation: 'syncPing 1.5s ease-in-out infinite' }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Eliminando archivos preeliminados offline...
                  </span>
                </div>
              )}

              {/* Estado completado (eliminación) */}
              {deleteShowComplete && (
                <div className="flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 size={14} className="text-primary" />
                  <span className="text-xs text-foreground font-medium">
                    {deleteTotalItems > 0
                      ? `${deleteTotalItems} ${deleteTotalItems === 1 ? 'archivo' : 'archivos'} eliminado${deleteTotalItems === 1 ? '' : 's'}`
                      : 'Archivos eliminados'}
                  </span>
                </div>
              )}
            </div>

            {/* Barra de progreso (eliminación) */}
            {deleteTotalItems > 0 && !deleteShowComplete && (
              <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-danger transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, ((deleteCurrentIndex + 1) / deleteTotalItems) * 100)}%`,
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
