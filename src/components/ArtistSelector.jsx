import { useState, useEffect } from 'react';
import { api, artistCoverUrl } from '../lib/api.js';
import { Check, Heart } from 'lucide-react';

export default function ArtistSelector({ userId }) {
  const [allArtists, setAllArtists] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState({});

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [artistsRes, favRes] = await Promise.all([
        api.getArtists(userId),
        api.getFavoriteArtists(userId)
      ]);
      setAllArtists(artistsRes.artists || []);
      setFavorites(favRes.artists || []);
    } catch (err) {
      console.error('Error cargando artistas:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (artistName) => {
    try {
      await api.toggleFavoriteArtist(artistName, userId);
      // Actualizar estado local
      setFavorites(prev => 
        prev.includes(artistName) 
          ? prev.filter(a => a !== artistName)
          : [...prev, artistName]
      );
    } catch (err) {
      console.error('Error al togglear artista:', err);
    }
  };

  // Filtrar por búsqueda
  const filtered = allArtists.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  // Verificar si un artista es favorito
  const isFavorite = (name) => favorites.includes(name);

  // Manejar error de imagen
  const handleImageError = (name) => {
    setImageErrors(prev => ({ ...prev, [name]: true }));
  };

  // Obtener la primera letra para el fallback
  const getInitial = (name) => name.charAt(0).toUpperCase();

  // Colores de fondo para fallback (basado en el nombre)
  const getBgColor = (name) => {
    const colors = [
      'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-yellow-600',
      'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
      'bg-orange-600', 'bg-cyan-600', 'bg-rose-600', 'bg-amber-600'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">Artistas favoritos</h3>
          <p className="text-sm text-muted-foreground">
            {favorites.length} {favorites.length === 1 ? 'artista seleccionado' : 'artistas seleccionados'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Heart size={18} className="text-primary" fill="currentColor" />
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Buscar artistas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-4 pr-4 py-2.5 rounded-lg bg-surface-2 text-white outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
        />
      </div>

      {/* Grid de artistas */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {search ? 'No se encontraron artistas' : 'No hay artistas en tu biblioteca'}
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-80 overflow-y-auto pr-1">
          {filtered.map(artist => {
            const favorite = isFavorite(artist.name);
            const hasImageError = imageErrors[artist.name];
            const imageUrl = artistCoverUrl(artist.name);

            return (
              <button
                key={artist.name}
                onClick={() => toggle(artist.name)}
                className={`
                  group relative flex flex-col items-center rounded-xl p-2 transition-all duration-200
                  ${favorite 
                    ? 'bg-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-surface' 
                    : 'bg-surface-2 hover:bg-surface-3'
                  }
                `}
              >
                {/* Foto del artista */}
                <div className={`
                  w-full aspect-square rounded-full overflow-hidden mb-1.5
                  ${favorite ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}
                `}>
                  {!hasImageError ? (
                    <img
                      src={imageUrl}
                      alt={artist.name}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(artist.name)}
                      loading="lazy"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${getBgColor(artist.name)} text-white text-3xl font-bold`}>
                      {getInitial(artist.name)}
                    </div>
                  )}
                </div>

                {/* Nombre */}
                <span className={`
                  text-xs font-light text-center w-full
                  ${favorite ? 'text-primary' : 'text-white group-hover:text-white'}
                `}>
                  {artist.name}
                </span>

                {/* Badge de selección */}
                {favorite && (
                  <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5 shadow-lg">
                    <Check size={14} className="text-black" strokeWidth={3} />
                  </div>
                )}

                {/* Indicador de hover (corazón) */}
                <div className={`
                  absolute inset-0 flex items-center justify-center rounded-xl
                  bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity
                  ${favorite ? 'opacity-0 group-hover:opacity-100' : ''}
                `}>
                  <Heart 
                    size={28} 
                    className={`transition-transform ${favorite ? 'text-primary scale-110' : 'text-white scale-100'}`}
                    fill={favorite ? 'currentColor' : 'none'}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Botón "Hecho" o estadísticas */}
      {favorites.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {favorites.length} artistas seleccionados
          </span>
          <button
            onClick={() => {
              // Opcional: cerrar el selector o mostrar un mensaje
              alert(`✅ ${favorites.length} artistas favoritos guardados`);
            }}
            className="px-4 py-1.5 bg-primary text-black text-sm font-semibold rounded-full hover:brightness-110 transition"
          >
            Hecho
          </button>
        </div>
      )}
    </div>
  );
}