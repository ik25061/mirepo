// Recomendaciones musicales híbridas: perfil de gustos + contexto + descubrimiento.
const normalise = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const asSet = value => value instanceof Set ? value : new Set(Array.isArray(value) ? value : []);
const genresOf = song => (Array.isArray(song?.genre) ? song.genre : [song?.genre]).filter(Boolean).map(normalise);
const artistOf = song => normalise(song?.artist || 'artista desconocido');
const stableTie = id => {
  let hash = 0;
  for (const ch of String(id ?? '')) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return Math.abs(hash % 997) / 997;
};

function buildProfile(songs, likedIds, history, favoriteArtists) {
  const liked = songs.filter(song => likedIds.has(String(song.id)));
  const historyRows = Array.isArray(history) ? history : [];
  const historyById = new Map();
  for (const item of historyRows) {
    const id = String(item.songId ?? item.id ?? '');
    if (!id) continue;
    const ts = Number(item.timestamp || item.playedAt || 0);
    const previous = historyById.get(id);
    if (!previous || ts > previous.timestamp) historyById.set(id, { timestamp: ts });
  }
  const listened = [...historyById.keys()].map(id => songs.find(song => String(song.id) === id)).filter(Boolean);
  const genreWeights = new Map();
  const artistWeights = new Map();
  const yearWeights = new Map();
  const bpmValues = [];
  const addProfileSong = (song, weight) => {
    for (const genre of genresOf(song)) genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight);
    const artist = artistOf(song);
    artistWeights.set(artist, (artistWeights.get(artist) || 0) + weight);
    if (song.year) {
      const decade = Math.floor(Number(song.year) / 10) * 10;
      if (Number.isFinite(decade)) yearWeights.set(decade, (yearWeights.get(decade) || 0) + weight);
    }
    const bpm = Number(song.bpm);
    if (Number.isFinite(bpm) && bpm > 0) bpmValues.push(bpm);
  };
  liked.forEach(song => addProfileSong(song, 3));
  listened.forEach(song => addProfileSong(song, 1));
  const favSet = new Set((favoriteArtists || []).map(item => normalise(typeof item === 'string' ? item : item?.name)));
  return { genreWeights, artistWeights, yearWeights, bpmAverage: bpmValues.length ? bpmValues.reduce((a,b)=>a+b,0)/bpmValues.length : null, historyById, favSet };
}

function scoreSong(song, profile) {
  let score = 0;
  const artist = artistOf(song);
  if (profile.favSet.has(artist)) score += 24;
  score += Math.min(24, genresOf(song).reduce((sum, genre) => sum + (profile.genreWeights.get(genre) || 0) * 3, 0));
  score += Math.min(12, (profile.artistWeights.get(artist) || 0) * 2);
  const year = Number(song.year);
  if (Number.isFinite(year) && year > 0) {
    const decade = Math.floor(year / 10) * 10;
    score += Math.min(5, (profile.yearWeights.get(decade) || 0) * 0.75);
  }
  const bpm = Number(song.bpm);
  if (profile.bpmAverage && Number.isFinite(bpm) && bpm > 0) {
    const distance = Math.abs(bpm - profile.bpmAverage);
    score += Math.max(0, 9 - distance / 8);
  }
  if (song.hasCover) score += 1;
  const played = profile.historyById.get(String(song.id));
  if (played?.timestamp) {
    const days = Math.max(0, (Date.now() - played.timestamp) / 86400000);
    score -= Math.max(0, 18 - days * 1.5);
  }
  return score;
}

export class RecommendationEngine {
  static recommend(songs, likedIds, favoriteArtists, history = [], limit = 20, options = {}) {
    if (!Array.isArray(songs) || songs.length === 0) return [];
    const liked = asSet(likedIds);
    const profile = buildProfile(songs, liked, history, favoriteArtists);
    const excluded = new Set((options.excludeIds || []).map(String));
    const candidates = songs
      .filter(song => song?.id != null && !excluded.has(String(song.id)) && !liked.has(String(song.id)))
      .map(song => ({ song, score: scoreSong(song, profile) }))
      .sort((a, b) => b.score - a.score || stableTie(a.song.id) - stableTie(b.song.id));

    // Primero diversifica artistas; después completa si la biblioteca es pequeña.
    const chosen = [];
    const artistCounts = new Map();
    const maxPerArtist = Math.max(1, Number(options.maxPerArtist) || 2);
    for (const item of candidates) {
      const artist = artistOf(item.song);
      if ((artistCounts.get(artist) || 0) >= maxPerArtist) continue;
      chosen.push({ ...item.song, recommendationScore: Math.round(item.score * 10) / 10 });
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      if (chosen.length >= limit) break;
    }
    if (chosen.length < limit) {
      const used = new Set(chosen.map(song => String(song.id)));
      for (const item of candidates) {
        if (used.has(String(item.song.id))) continue;
        chosen.push({ ...item.song, recommendationScore: Math.round(item.score * 10) / 10 });
        if (chosen.length >= limit) break;
      }
    }
    return chosen;
  }

  static generateMoodPlaylist(songs, mood, likedIds, favoriteArtists, limit = 15, history = []) {
    const moodMap = {
      feliz: ['pop', 'dance', 'reggaeton', 'disco', 'funk'],
      triste: ['balada', 'bolero', 'blues', 'soul', 'acustico'],
      energia: ['rock', 'metal', 'electronica', 'punk', 'dance'],
      relax: ['jazz', 'acustico', 'clasica', 'ambient', 'chill'],
      romantico: ['bachata', 'salsa', 'bolero', 'romantica', 'r&b'],
      fiesta: ['dance', 'reggaeton', 'house', 'pop', 'salsa'],
      concentracion: ['ambient', 'instrumental', 'clasica', 'jazz', 'soundtrack']
    };
    const key = normalise(mood);
    const targets = moodMap[key] || [];
    const liked = asSet(likedIds);
    const profile = buildProfile(songs || [], liked, history, favoriteArtists);
    const candidates = (songs || []).filter(song => song?.id != null && !liked.has(String(song.id)));
    const ranked = candidates.map(song => {
      const matching = genresOf(song).filter(genre => targets.some(target => genre.includes(target) || target.includes(genre)));
      let score = matching.length * 15 + scoreSong(song, profile) * 0.35;
      const bpm = Number(song.bpm);
      if (key === 'energia' || key === 'fiesta') {
        if (Number.isFinite(bpm) && bpm >= 115) score += 8;
      } else if (key === 'relax' || key === 'concentracion') {
        if (Number.isFinite(bpm) && bpm <= 100) score += 8;
      }
      return { song, score };
    }).sort((a,b) => b.score-a.score || stableTie(a.song.id)-stableTie(b.song.id));
    const output = [];
    const counts = new Map();
    for (const item of ranked) {
      const artist = artistOf(item.song);
      if ((counts.get(artist) || 0) >= 2) continue;
      output.push(item.song);
      counts.set(artist, (counts.get(artist) || 0) + 1);
      if (output.length >= limit) break;
    }
    return output;
  }

  static getMonthlySummary(history, songs) {
    if (!Array.isArray(history) || !history.length) return null;
    const now = new Date();
    const monthRows = history.filter(item => {
      const date = new Date(Number(item.timestamp || item.playedAt || 0));
      return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    if (!monthRows.length) return null;
    const byId = new Map((songs || []).map(song => [String(song.id), song]));
    const songCounts = new Map(), artistCounts = new Map(), genreCounts = new Map();
    let totalMinutes = 0;
    for (const entry of monthRows) {
      const song = byId.get(String(entry.songId ?? entry.id));
      if (!song) continue;
      const id = String(song.id);
      songCounts.set(id, (songCounts.get(id) || 0) + 1);
      const artist = song.artist || 'Desconocido';
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      for (const genre of (Array.isArray(song.genre) ? song.genre : [song.genre]).filter(Boolean)) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }
      totalMinutes += Math.max(0, Number(song.duration) || 0) / 60;
    }
    const top = map => [...map.entries()].sort((a,b)=>b[1]-a[1]);
    const top5Songs = top(songCounts).slice(0,5).map(([id])=>byId.get(id)).filter(Boolean);
    return {
      month: `${now.getMonth()+1}/${now.getFullYear()}`,
      totalSongs: monthRows.length,
      uniqueSongs: songCounts.size,
      totalMinutes: Math.round(totalMinutes),
      topSong: top5Songs[0]?.title || 'N/A',
      topArtist: top(artistCounts)[0]?.[0] || 'N/A',
      topGenre: top(genreCounts)[0]?.[0] || 'N/A',
      top5Songs
    };
  }
}
