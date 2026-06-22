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

export function buildAlbums(songs) {
  return groupBy(songs, (s) => s.album)
    .map((g) => ({
      ...g,
      artist: g.songs[0].artist,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildArtists(songs) {
  return groupBy(songs, (s) => s.artist)
    .map((g) => ({
      ...g,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildGenres(songs) {
  return groupBy(songs, (s) => s.genre)
    .map((g) => ({
      ...g,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0].id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}