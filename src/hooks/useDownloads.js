/**
 * ============================================================
 * USE DOWNLOADS - GESTIÓN DE DESCARGA DE CANCIONES
 * ============================================================
 * 
 * Maneja el almacenamiento de canciones en IndexedDB para
 * reproducción offline. Incluye:
 * - Descarga de canciones individuales
 * - Descarga masiva de 100 canciones
 * - Verificación de estado de descarga
 * - Eliminación de canciones descargadas
 * - Sincronización de metadatos (likes)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { audioUrl, coverUrl } from '../lib/api.js';

const DB_NAME = 'mirepo_downloads';
const DB_VERSION = 1;
const STORE_NAME = 'songs';
const PENDING_LIKE_CHANGES_KEY = 'mirepo_downloads_pending_likes';

// ============================================================
// GESTIÓN DE INDEXEDDB
// ============================================================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('downloadedAt', 'downloadedAt');
        store.createIndex('liked', 'liked');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStore(mode = 'readonly') {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, mode);
  return transaction.objectStore(STORE_NAME);
}

// ============================================================
// FUNCIONES DE ALMACENAMIENTO
// ============================================================

export async function getDownloadedSongs() {
  try {
    const store = await getStore('readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function isSongDownloaded(songId) {
  try {
    const store = await getStore('readonly');
    return new Promise((resolve) => {
      const request = store.get(songId);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getDownloadedIds() {
  try {
    const songs = await getDownloadedSongs();
    return new Set(songs.map(s => s.id));
  } catch {
    return new Set();
  }
}

export async function saveDownloadedSong(song, audioBlob, coverBlob = null) {
  try {
    const store = await getStore('readwrite');
    const entry = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      relPath: song.relPath,
      audioBlob: audioBlob,
      coverBlob: coverBlob,
      liked: song.liked || false,
      downloaded: true,
      downloadedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve(entry);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[useDownloads] Error guardando canción descargada:', error);
    throw error;
  }
}

export async function removeDownloadedSong(songId) {
  try {
    const store = await getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(songId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return false;
  }
}

export async function updateDownloadedLike(songId, liked) {
  try {
    const store = await getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const entry = request.result;
        if (entry) {
          entry.liked = liked;
          const updateRequest = store.put(entry);
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve(false);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return false;
  }
}

export async function getDownloadedSong(songId) {
  try {
    const store = await getStore('readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(songId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

// ============================================================
// HOOK PRINCIPAL
// ============================================================

export function useDownloads() {
  const [downloadedIds, setDownloadedIds] = useState(new Set());
  const [downloadedSongs, setDownloadedSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [pendingLikeChanges, setPendingLikeChanges] = useState([]);
  const isDownloadingRef = useRef(false);
  const pendingLikeChangesRef = useRef([]);

  // ============================================================
  // CARGAR ESTADO INICIAL
  // ============================================================

  const loadDownloads = useCallback(async () => {
    try {
      setLoading(true);
      const songs = await getDownloadedSongs();
      setDownloadedSongs(songs);
      setDownloadedIds(new Set(songs.map(s => s.id)));
    } catch (error) {
      console.error('[useDownloads] Error cargando descargas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      loadDownloads();
    };
    window.addEventListener('mirepo-reload-downloads', handler);
    return () => window.removeEventListener('mirepo-reload-downloads', handler);
  }, [loadDownloads]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(PENDING_LIKE_CHANGES_KEY) || '[]');
      if (Array.isArray(stored)) {
        setPendingLikeChanges(stored);
        pendingLikeChangesRef.current = stored;
      }
    } catch (error) {
      console.warn('[useDownloads] No se pudo cargar cambios pendientes de likes:', error);
    }
  }, []);

  // ============================================================
  // DESCARGAR UNA CANCIÓN INDIVIDUAL
  // ============================================================

  const downloadSong = useCallback(async (song) => {
    if (!song) return false;
    if (downloadedIds.has(song.id)) return true;

    try {
      // Descargar audio
      const audioResponse = await fetch(audioUrl(song.id));
      if (!audioResponse.ok) throw new Error('Error descargando audio');
      const audioBlob = await audioResponse.blob();

      // Verificar que el blob no esté vacío
      if (audioBlob.size === 0) throw new Error('Archivo de audio vacío');

      // Descargar portada (opcional)
      let coverBlob = null;
      try {
        const coverResponse = await fetch(coverUrl(song.id));
        if (coverResponse.ok) {
          coverBlob = await coverResponse.blob();
        }
      } catch { }

      const savedEntry = await saveDownloadedSong(song, audioBlob, coverBlob);

      // Actualizar estado
      setDownloadedIds(prev => new Set([...prev, song.id]));
      setDownloadedSongs(prev => [...prev, { ...savedEntry, liked: song.liked || false }]);

      return true;
    } catch (error) {
      console.error('[useDownloads] Error descargando canción:', error);
      return false;
    }
  }, [downloadedIds]);

  // ============================================================
  // DESCARGAR MÚLTIPLES CANCIONES (MÁXIMO 100)
  // ============================================================

  const downloadSongs = useCallback(async (songsToDownload) => {
    if (isDownloadingRef.current) return;
    if (!songsToDownload || songsToDownload.length === 0) return;

    // Filtrar canciones ya descargadas
    const toDownload = songsToDownload.filter(s => !downloadedIds.has(s.id));
    if (toDownload.length === 0) return;

    isDownloadingRef.current = true;
    setDownloadProgress({ current: 0, total: toDownload.length });

    let successCount = 0;
    let failedIds = [];

    const batchSize = 100;
    for (let offset = 0; offset < toDownload.length; offset += batchSize) {
      const batch = toDownload.slice(offset, offset + batchSize);
      for (let i = 0; i < batch.length; i++) {
        const song = batch[i];
        const success = await downloadSong(song);
        if (success) {
          successCount++;
        } else {
          failedIds.push(song.id);
        }
        setDownloadProgress({ current: offset + i + 1, total: toDownload.length });
      }
    }

    isDownloadingRef.current = false;
    setDownloadProgress({ current: 0, total: 0 });

    return { successCount, failedIds, total: toDownload.length };
  }, [downloadedIds, downloadSong]);

  // ============================================================
  // ELIMINAR CANCIÓN DESCARGADA
  // ============================================================

  const removeDownload = useCallback(async (songId) => {
    try {
      await removeDownloadedSong(songId);
      setDownloadedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(songId);
        return newSet;
      });
      setDownloadedSongs(prev => prev.filter(s => s.id !== songId));
      return true;
    } catch (error) {
      console.error('[useDownloads] Error eliminando descarga:', error);
      return false;
    }
  }, []);

  // ============================================================
  // ACTUALIZAR ESTADO DE "ME GUSTA" EN CANCIONES DESCARGADAS
  // ============================================================

  // ============================================================
  // SINCRONIZAR "ME GUSTA" CON EL SERVIDOR
  // ============================================================

  const savePendingLikeChanges = useCallback((changes) => {
    setPendingLikeChanges(changes);
    pendingLikeChangesRef.current = changes;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PENDING_LIKE_CHANGES_KEY, JSON.stringify(changes));
    }
  }, []);

  const pushPendingLikeChange = useCallback((songId, liked) => {
    const next = [
      ...pendingLikeChangesRef.current.filter((entry) => entry.songId !== songId),
      { songId, liked },
    ];
    savePendingLikeChanges(next);
  }, [savePendingLikeChanges]);

  const updateLiked = useCallback(async (songId, liked) => {
    try {
      await updateDownloadedLike(songId, liked);
      setDownloadedSongs(prev => prev.map(s =>
        s.id === songId ? { ...s, liked } : s
      ));
      pushPendingLikeChange(songId, liked);
      return true;
    } catch (error) {
      console.error('[useDownloads] Error actualizando like:', error);
      return false;
    }
  }, [pushPendingLikeChange]);

  const syncLikes = useCallback(async (userId) => {
    const pending = pendingLikeChangesRef.current;
    if (!userId || pending.length === 0) return;

    try {
      const promises = pending.map(({ songId, liked }) =>
        fetch('/api/songs/' + songId + '/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ liked, userId })
        })
      );

      await Promise.all(promises);
      savePendingLikeChanges([]);
      console.log('[useDownloads] Likes/deletes sincronizados:', pending.length);
    } catch (error) {
      console.error('[useDownloads] Error sincronizando likes:', error);
    }
  }, [savePendingLikeChanges]);

  // ============================================================
  // VERIFICAR SI UNA CANCIÓN ESTÁ DESCARGADA
  // ============================================================

  const isDownloaded = useCallback((songId) => {
    return downloadedIds.has(songId);
  }, [downloadedIds]);

  return {
    downloadedIds,
    downloadedSongs,
    loading,
    downloadProgress,
    pendingLikeChanges,
    isDownloading: isDownloadingRef.current,
    downloadSong,
    downloadSongs,
    removeDownload,
    updateLiked,
    syncLikes,
    isDownloaded,
    reload: loadDownloads,
  };
}