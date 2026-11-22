// Generación contextual ligera: evita cargar un modelo GPT-2 en el navegador.
// Estas funciones trabajan con estadísticas reales para no inventar datos del usuario.

const pick = (items, fallback) => items.length ? items[0] : fallback;
const clean = value => String(value || '').trim();

export async function loadAIModel() {
  // Compatibilidad con llamadas antiguas. Ya no descargamos un modelo inadecuado
  // para español ni consumimos memoria del dispositivo para textos deterministas.
  return null;
}

export async function generateMonthlySummary(data = {}) {
  const totalSongs = Math.max(0, Number(data.totalSongs) || 0);
  const minutes = Math.max(0, Number(data.totalMinutes) || 0);
  const artist = clean(data.topArtist) || 'tus artistas favoritos';
  const genre = clean(data.topGenre) || 'varios estilos';
  const unique = Math.max(0, Number(data.uniqueSongs) || 0);

  if (!totalSongs) return 'Todavía no hay suficientes escuchas este mes para preparar tu resumen. ¡Empieza a explorar tu biblioteca!';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const time = hours ? `${hours} h y ${remainder} min` : `${minutes} minutos`;
  const discovery = unique > 0 && unique < totalSongs
    ? ` Has vuelto a algunas de tus canciones conocidas (${unique} temas distintos).`
    : ' Has mantenido una escucha variada.';
  return `Este mes has reproducido ${totalSongs} canciones y disfrutado de ${time}. ${artist} ha sido tu artista más escuchado y ${genre} tu estilo destacado.${discovery}`;
}

export async function generatePlaylistName(songs = [], options = {}) {
  const valid = Array.isArray(songs) ? songs : [];
  if (!valid.length) return 'Mi selección musical';

  const artists = [...new Set(valid.map(song => clean(song.artist)).filter(Boolean))];
  const genreCounts = new Map();
  for (const song of valid) {
    const genres = Array.isArray(song.genre) ? song.genre : [song.genre];
    for (const genre of genres.filter(Boolean)) {
      const label = clean(genre);
      genreCounts.set(label, (genreCounts.get(label) || 0) + 1);
    }
  }
  const topGenre = [...genreCounts.entries()].sort((a,b) => b[1]-a[1])[0]?.[0];
  const mood = clean(options.mood);
  if (mood) return `${mood.charAt(0).toUpperCase() + mood.slice(1)} en reproducción`;
  if (topGenre && artists.length >= 2) return `${topGenre}: nuevos sonidos`;
  if (topGenre) return `Lo mejor del ${topGenre}`;
  if (artists.length === 1) return `Selección de ${artists[0]}`;
  if (artists.length > 1) return `${artists[0]} y compañía`;
  return 'Mi selección musical';
}

export function unloadAIModel() {
  // Se conserva como no-op por compatibilidad con versiones anteriores.
}
