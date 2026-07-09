import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const OfflineContext = createContext(null);

const AUDIO_FILE_REGEX = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;
const DB_NAME = 'mirepo-offline';
const STORE_NAME = 'handles';
const LOCAL_LIKES_KEY = 'mirepo_local_likes';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectoryHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, 'musicDirectory');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadDirectoryHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('musicDirectory');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadLocalLikes() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_LIKES_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalLikes(likes) {
  window.localStorage.setItem(LOCAL_LIKES_KEY, JSON.stringify(likes));
}

async function scanDirectoryEntries(directoryHandle, prefix = '') {
  const songs = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'file' && AUDIO_FILE_REGEX.test(name)) {
      songs.push({
        id: `local:${relativePath}`,
        title: name.replace(/\.[^.]+$/, ''),
        artist: 'Archivos locales',
        album: prefix || 'Descargadas',
        path: relativePath,
        fileHandle: handle,
        local: true,
      });
    }

    if (handle.kind === 'directory') {
      const nestedSongs = await scanDirectoryEntries(handle, relativePath);
      songs.push(...nestedSongs);
    }
  }

  return songs;
}

export function OfflineProvider({ children }) {
  const [localSongs, setLocalSongs] = useState([]);
  const [localFolderName, setLocalFolderName] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [localLikes, setLocalLikes] = useState(() => loadLocalLikes());
  const [supported, setSupported] = useState(false);
  const localUrlCacheRef = useRef(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported(Boolean(window.showDirectoryPicker && window.indexedDB));
  }, []);

  const applyLikes = useCallback((songs, likes) => {
    return songs.map((song) => ({
      ...song,
      liked: Boolean(likes[song.id]),
    }));
  }, []);

  const getLocalSongUrl = useCallback(async (song) => {
    if (!song?.local || !song.fileHandle) return null;

    const cachedUrl = localUrlCacheRef.current.get(song.id);
    if (cachedUrl) return cachedUrl;

    const file = await song.fileHandle.getFile();
    const objectUrl = URL.createObjectURL(file);
    localUrlCacheRef.current.set(song.id, objectUrl);
    return objectUrl;
  }, []);

  const scanDirectory = useCallback(async (directoryHandle) => {
    setLocalLoading(true);
    setLocalError(null);

    const songs = await scanDirectoryEntries(directoryHandle);
    const songsWithLikes = applyLikes(songs, localLikes);

    setLocalSongs(songsWithLikes);
    setLocalFolderName(directoryHandle.name || 'Música local');
    setOfflineMode(true);
    setLocalLoading(false);

    return songsWithLikes;
  }, [applyLikes, localLikes]);

  const openLocalFolder = useCallback(async () => {
    if (!supported) {
      setLocalError('El navegador no soporta acceso a carpetas locales.');
      return;
    }

    try {
      setLocalLoading(true);
      const directoryHandle = await window.showDirectoryPicker();
      await saveDirectoryHandle(directoryHandle);
      await scanDirectory(directoryHandle);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setLocalError(error.message || 'Error abriendo la carpeta local');
      }
      setLocalLoading(false);
    }
  }, [supported, scanDirectory]);

  const toggleLocalLike = useCallback((songId) => {
    setLocalSongs((prevSongs) => {
      return prevSongs.map((song) => {
        if (song.id !== songId) return song;
        const nextLiked = !song.liked;
        return { ...song, liked: nextLiked };
      });
    });

    setLocalLikes((prev) => {
      const next = { ...prev };
      next[songId] = !next[songId];
      if (!next[songId]) {
        delete next[songId];
      }
      saveLocalLikes(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!supported) return;

    loadDirectoryHandle()
      .then(async (directoryHandle) => {
        if (directoryHandle) {
          await scanDirectory(directoryHandle);
        }
      })
      .catch((error) => {
        console.error('[OfflineContext] Error al restaurar carpeta local:', error);
      });
  }, [supported, scanDirectory]);

  const value = {
    localSongs,
    localFolderName,
    offlineMode,
    localLoading,
    localError,
    supported,
    openLocalFolder,
    toggleLocalLike,
    getLocalSongUrl,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline debe usarse dentro de OfflineProvider');
  }
  return context;
}
