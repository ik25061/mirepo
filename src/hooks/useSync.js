/**
 * ============================================================
 * USE SYNC - SINCRONIZACIÓN DE DATOS OFFLINE
 * ============================================================
 */

import { useEffect, useCallback, useState } from 'react';
import { useDownload } from '../context/DownloadContext';

export function useSync(userId) {
  const { syncLikes, downloadedSongs, pendingLikeChanges } = useDownload();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

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
    if (isSyncing) return;
    
    // Verificar si hay cambios pendientes
    if (pendingLikeChanges.length === 0 && !force) return;

    try {
      setIsSyncing(true);
      await syncLikes(userId);
      setLastSync(new Date());
    } catch (error) {
      console.error('[useSync] Error en sincronización:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, syncLikes, userId, pendingLikeChanges.length]);

  // Sincronización automática al estar online
  useEffect(() => {
    if (isOnline && pendingLikeChanges.length > 0) {
      sync();
    }
  }, [isOnline, sync, pendingLikeChanges.length]);

  return { isOnline, isSyncing, lastSync, sync };
}