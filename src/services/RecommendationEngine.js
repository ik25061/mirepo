// src/services/RecommendationEngine.js

export class RecommendationEngine {
  /**
   * Recomienda canciones basado en:
   * - Likes del usuario
   * - Artistas favoritos
   * - Géneros más escuchados
   * - Años preferidos
   * - Historial reciente (evita repeticiones)
   */
  static recommend(songs, likedIds, favoriteArtists, history, limit = 20) {
    if (!songs || songs.length === 0) return [];
    
    // Canciones que ya le gustan (para extraer patrones)
    const likedSongs = songs.filter(s => likedIds.has(s.id));
    
    // Si no hay likes, recomendar aleatorias pero con artistas favoritos
    if (likedSongs.length === 0) {
      const favSongs = songs.filter(s => favoriteArtists.includes(s.artist));
      if (favSongs.length > 0) {
        return favSongs.sort(() => Math.random() - 0.5).slice(0, limit);
      }
      return songs.sort(() => Math.random() - 0.5).slice(0, limit);
    }
    
    // Extraer géneros y años favoritos
    const genreCount = {};
    const yearCount = {};
    likedSongs.forEach(s => {
      const genre = s.genre || 'Sin género';
      genreCount[genre] = (genreCount[genre] || 0) + 1;
      const year = s.year || '0';
      yearCount[year] = (yearCount[year] || 0) + 1;
    });
    
    // Ordenar por frecuencia
    const topGenres = Object.keys(genreCount).sort((a,b) => genreCount[b] - genreCount[a]).slice(0, 5);
    const topYears = Object.keys(yearCount).sort((a,b) => yearCount[b] - yearCount[a]).slice(0, 3);
    
    // Puntuar canciones no escuchadas (ni liked ni en historial)
    const historyIds = new Set((Array.isArray(history) ? history : []).map(h => h.songId));
    const candidates = songs.filter(s => !likedIds.has(s.id) && !historyIds.has(s.id));
    
    const scored = candidates.map(song => {
      let score = 0;
      
      // Artista favorito (+50)
      if (favoriteArtists.includes(song.artist)) score += 50;
      
      // Género popular (+20)
      if (topGenres.includes(song.genre)) score += 20;
      
      // Año popular (+10)
      if (topYears.includes(String(song.year))) score += 10;
      
      // Mismo artista que canciones liked (+5 por cada)
      const artistLikes = likedSongs.filter(s => s.artist === song.artist).length;
      score += artistLikes * 5;
      
      // Si tiene portada (+5)
      if (song.hasCover) score += 5;
      
      return { ...song, score };
    });
    
    // Ordenar y devolver
    return scored.sort((a,b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Genera una playlist temática basada en un estado de ánimo
   */
  static generateMoodPlaylist(songs, mood, likedIds, favoriteArtists, limit = 15) {
    const moodMap = {
      'feliz': ['pop', 'dance', 'reggaeton', 'disco'],
      'triste': ['balada', 'bolero', 'blues', 'soul'],
      'energía': ['rock', 'metal', 'electrónica', 'punk'],
      'relax': ['jazz', 'acústico', 'clásica', 'ambient'],
      'romántico': ['bachata', 'salsa', 'bolero', 'romántica']
    };
    
    const genres = moodMap[mood] || [];
    const candidates = songs.filter(s => 
      !likedIds.has(s.id) && 
      genres.some(g => (s.genre || '').toLowerCase().includes(g))
    );
    
    // Mezclar y devolver
    return candidates.sort(() => Math.random() - 0.5).slice(0, limit);
  }

  /**
   * Resumen mensual: estadísticas de escucha
   */
  static getMonthlySummary(history, songs) {
    if (!history || history.length === 0) return null;
    
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    const monthHistory = history.filter(h => {
      const d = new Date(h.timestamp);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    
    if (monthHistory.length === 0) return null;
    
    const topSongs = {};
    const topArtists = {};
    const topGenres = {};
    let totalMinutes = 0;
    
    monthHistory.forEach(h => {
      const song = songs.find(s => s.id === h.songId);
      if (!song) return;
      
      topSongs[song.id] = (topSongs[song.id] || 0) + 1;
      topArtists[song.artist] = (topArtists[song.artist] || 0) + 1;
      topGenres[song.genre] = (topGenres[song.genre] || 0) + 1;
      totalMinutes += (song.duration || 0) / 60;
    });
    
    // Ordenar
    const sortByCount = (obj) => Object.entries(obj).sort((a,b) => b[1] - a[1]);
    const top5SongsIds = sortByCount(topSongs).slice(0, 5).map(([id]) => id);
    const top5Songs = top5SongsIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
    
    return {
      month: `${month+1}/${year}`,
      totalSongs: monthHistory.length,
      totalMinutes: Math.round(totalMinutes),
      topSong: top5Songs[0]?.title || 'N/A',
      topArtist: sortByCount(topArtists)[0]?.[0] || 'N/A',
      topGenre: sortByCount(topGenres)[0]?.[0] || 'N/A',
      top5Songs,
    };
  }
}