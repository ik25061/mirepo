/**
 * ============================================================
 * USE SYNC - SINCRONIZACIÓN DE DATOS OFFLINE
 * ============================================================
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useDownload } from '../context/DownloadContext';

export function useSync(userId) {
  const { syncLikes, downloadedSongs, pendingLikeChanges, syncingSongs, currentlySyncingSong } = useDownload();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const pendingCountRef = useRef(pendingLikeChanges.length);

  // Mantener ref actualizada
  useEffect(() => {
    pendingCountRef.current = pendingLikeChanges.length;
  }, [pendingLikeChanges]);

  // Detectar cambios en la conectividad
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sincronizar automáticamente cuando hay conexión
  const sync = useCallback(async (force = false) => {
    if (!isOnline) return;
    if (isSyncingRef.current) return;
    
    // Verificar si hay cambios pendientes
    if (pendingLikeChanges.length === 0 && !force) return;

    try {
      isSyncingRef.current = true;
      setIsSyncing(true);
      await syncLikes(userId);
      setLastSync(new Date());
    } catch (error) {
      console.error('[useSync] Error en sincronización:', error);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, syncLikes, userId, pendingLikeChanges.length]);

  // Sincronización automática al estar online
  useEffect(() => {
    if (isOnline && pendingLikeChanges.length > 0 && !isSyncingRef.current) {
      sync();
    }
  }, [isOnline, sync, pendingLikeChanges.length]);

  return { 
    isOnline, 
    isSyncing, 
    lastSync, 
    sync,
    syncingSongs,
    currentlySyncingSong,
    pendingCount: pendingLikeChanges.length,
  };
}
