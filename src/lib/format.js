export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function groupBy(songs, keyFn) {
  const map = new Map();
  for (const song of songs) {
    const key = keyFn(song);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(song);
  }
  return [...map.entries()].map(([name, items]) => ({ name, songs: items }));
}

function normalizeKey(str) {
  return String(str || '')
    .trim()
    .toLowerCase();
}

export function buildAlbums(songs) {
  const map = new Map();
  for (const s of songs) {
    const raw = s.album || 'Sin álbum';
    const key = normalizeKey(raw);
    let entry = map.get(key);
    if (!entry) {
      entry = { name: raw, artist: s.artist, songs: [] };
      map.set(key, entry);
    } else {
      if (!entry.artist && s.artist) entry.artist = s.artist;
    }
    entry.songs.push(s);
  }
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      artist: g.artist,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildArtists(songs) {
  const map = new Map();
  for (const s of songs) {
    const raw = s.artist || 'Artista desconocido';
    const key = normalizeKey(raw);
    let entry = map.get(key);
    if (!entry) {
      entry = { name: raw, songs: [] };
      map.set(key, entry);
    }
    entry.songs.push(s);
  }
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildGenres(songs) {
  const map = new Map();
  for (const s of songs) {
    const raw = s.genre || 'Sin género';
    const key = normalizeKey(raw);
    let entry = map.get(key);
    if (!entry) {
      entry = { name: raw, songs: [] };
      map.set(key, entry);
    }
    entry.songs.push(s);
  }
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildYears(songs) {
  const map = new Map();
  for (const s of songs) {
    const raw = s.year || 'Sin año';
    const key = normalizeKey(String(raw));
    let entry = map.get(key);
    if (!entry) {
      entry = { name: String(raw), songs: [] };
      map.set(key, entry);
    }
    entry.songs.push(s);
  }
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => {
      const ya = parseInt(a.name, 10);
      const yb = parseInt(b.name, 10);
      if (!isNaN(ya) && !isNaN(yb)) return yb - ya;
      if (!isNaN(ya)) return -1;
      if (!isNaN(yb)) return 1;
      return a.name.localeCompare(b.name, 'es');
    });
}
