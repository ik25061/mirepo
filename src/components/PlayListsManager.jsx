/**
 * ============================================================
 * PLAY LISTS MANAGER - GESTOR DE LISTAS DE REPRODUCCIÓN
 * ============================================================
 * 
 * Muestra todas las listas de reproducción del usuario,
 * permite crear nuevas listas, ver su contenido y eliminarlas.
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Play, Trash2, ListMusic, Music2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from './SongRow.jsx';

export default function PlayListsManager({ 
  userId, 
  onBack, 
  onLike, 
  onDislike, 
  onDislikeArtist, 
  onDelete,
  allSongs 
}) {
  const { play } = usePlayer();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedPlayList, setSelectedPlayList] = useState(null);
  const [playListSongs, setPlayListSongs] = useState([]);

  // Cargar listas
  const loadPlayLists = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getPlayLists(userId);
      setPlaylists(data.playlists || []);
    } catch (err) {
      console.error('Error cargando playlists:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPlayLists();
  }, [loadPlayLists]);

  // Crear nueva lista
  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await api.createPlayList(newName, newDescription, userId);
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
      await loadPlayLists();
    } catch (err) {
      console.error('Error creando playlist:', err);
    }
  };

  // Eliminar lista
  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta lista de reproducción?')) return;
    try {
      await api.deletePlayList(id);
      if (selectedPlayList?.id === id) {
        setSelectedPlayList(null);
        setPlayListSongs([]);
      }
      await loadPlayLists();
    } catch (err) {
      console.error('Error eliminando playlist:', err);
    }
  };

  // Ver contenido de una lista
  const handleSelectPlayList = async (playlist) => {
    try {
      const data = await api.getPlayList(playlist.id);
      const pl = data.playlist;
      // Resolver canciones por IDs
      const songs = (pl.songIds || [])
        .map(id => allSongs.find(s => s.id === id))
        .filter(Boolean);
      setSelectedPlayList(pl);
      setPlayListSongs(songs);
    } catch (err) {
      console.error('Error obteniendo playlist:', err);
    }
  };

  // Volver a la lista de playlists
  const handleBackToList = () => {
    setSelectedPlayList(null);
    setPlayListSongs([]);
  };

  // Calcular likedIds a partir de allSongs
  const likedIds = new Set(allSongs?.filter(s => s.liked).map(s => s.id) || []);

  // Si estamos viendo una lista específica
  if (selectedPlayList) {
    return (
      <div className="flex flex-col gap-4 pb-20">
        <button
          onClick={handleBackToList}
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft size={16} /> Volver a listas
        </button>

        <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
          <div className="grid h-36 w-36 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/80 to-blue-600/40 text-primary-foreground shadow-2xl sm:h-44 sm:w-44">
            <ListMusic size={48} />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lista de reproducción</p>
            <h1 className="mt-1 font-display text-3xl font-700 tracking-tight text-balance sm:text-4xl">
              {selectedPlayList.name}
            </h1>
            {selectedPlayList.description && (
              <p className="mt-1 text-sm text-muted-foreground">{selectedPlayList.description}</p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {playListSongs.length} {playListSongs.length === 1 ? 'canción' : 'canciones'}
            </p>
            {playListSongs.length > 0 && (
              <button
                onClick={() => play(playListSongs[0], playListSongs)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
              >
                <Play size={18} fill="currentColor" /> Reproducir
              </button>
            )}
          </div>
        </header>

        {playListSongs.length > 0 ? (
          <div className="rounded-xl border border-border bg-surface/50 p-2">
            {playListSongs.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={playListSongs}
                onLike={onLike}
                onDislike={onDislike}
                onDislikeArtist={onDislikeArtist}
                onDelete={onDelete}
                showDelete
                context={null}
                likedIds={likedIds}
              />
            ))}
          </div>

        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Music2 size={48} className="text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Esta lista está vacía</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Agrega canciones desde el menú de cada canción
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-700 tracking-tight text-white sm:text-3xl">Listas de reproducción</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {playlists.length} {playlists.length === 1 ? 'lista' : 'listas'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
        >
          <Plus size={16} /> Nueva lista
        </button>
      </header>

      {/* ===== FORMULARIO CREAR LISTA ===== */}
      {showCreateForm && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre de la lista"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <input
            type="text"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            className="mt-2 w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:scale-105 disabled:opacity-50"
            >
              Crear
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewName('');
                setNewDescription('');
              }}
              className="rounded-full bg-surface-2 px-4 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ===== LISTA DE LISTAS ===== */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : playlists.length > 0 ? (
        <div className="flex flex-col gap-2">
          {playlists.map(pl => (
            <div
              key={pl.id}
              onClick={() => handleSelectPlayList(pl)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface/50 p-3 transition hover:bg-surface-2 cursor-pointer"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500/40 to-blue-600/20">
                <ListMusic size={20} className="text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{pl.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {pl.songIds?.length || 0} {(pl.songIds?.length || 0) === 1 ? 'canción' : 'canciones'}
                  {pl.description && ` · ${pl.description}`}
                </p>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation();
                  handleDelete(pl.id);
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                title="Eliminar lista"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListMusic size={48} className="text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No hay listas de reproducción</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Crea tu primera lista para organizar tu música
          </p>
        </div>
      )}
    </div>
  );
}