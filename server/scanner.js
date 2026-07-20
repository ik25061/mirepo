import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import { db } from './db.js';
import 'dotenv/config';

export const MUSIC_DIR = process.env.VITE_MUSIC_PATH || 'E:/musica';
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.webm']);

function walk(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === 'trash') continue;
        walk(full, files);
      } else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  } catch {}
  return files;
}

export async function scanLibrary() {
  console.log('[scanner] 🔄 Sincronizando directorio local con base de datos...');
  
  // 1. Intentar importar desde songs_cache.json si la BD está vacía
  const count = await db.get('SELECT COUNT(*) as count FROM songs');
  if (count.count === 0) {
    console.log('[scanner] 📦 BD vacía, intentando importar desde songs_cache.json...');
    try {
      const { importSongsFromCache } = await import('./db.js');
      const result = await importSongsFromCache();
      if (result.imported > 0) {
        console.log(`[scanner] ✅ ${result.imported} canciones importadas desde cache`);
      }
    } catch (err) {
      console.log('[scanner] ⚠️ No se pudo importar cache:', err.message);
    }
  }

  // 2. Escanear el directorio para añadir canciones nuevas que no estén en la BD
  const files = walk(MUSIC_DIR);
  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const relPath = path.relative(MUSIC_DIR, file);
      const id = crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 16);
      
      // Validar si ya está indexado
      const trackExists = await db.get('SELECT id FROM songs WHERE id = ?', [id]);
      if (trackExists) {
        skipped++;
        continue;
      }

      let meta = { common: {}, format: {} };
      try { meta = await parseFile(file, { duration: true }); } catch {}

      const title = meta.common.title || path.basename(file, path.extname(file));
      const artist = meta.common.artist || 'Artista desconocido';
      const album = meta.common.album || 'Álbum desconocido';
      const year = meta.common.year || null;
      const track = meta.common.track?.no || null;
      const duration = meta.format.duration ? Math.round(meta.format.duration) : null;
      
      const basePath = file.slice(0, -path.extname(file).length);
      const hasLyrics = fs.existsSync(`${basePath}.lrc`) ? 1 : 0;

      // Inserciones Atómicas Relacionales
      await db.run('INSERT OR IGNORE INTO artists (name) VALUES (?)', [artist]);
      const artRow = await db.get('SELECT id FROM artists WHERE name = ?', [artist]);
      
      await db.run('INSERT OR IGNORE INTO albums (name, main_artist_id, year) VALUES (?, ?, ?)', [album, artRow.id, year]);
      const albRow = await db.get('SELECT id FROM albums WHERE name = ? AND main_artist_id = ?', [album, artRow.id]);

      await db.run(
        'INSERT OR IGNORE INTO songs (id, title, relPath, duration, track, hasLyrics, album_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, title, relPath, duration, track, hasLyrics, albRow.id]
      );

      await db.run('INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main) VALUES (?, ?, 1)', [id, artRow.id]);

      let genres = meta.common.genre || ['Sin género'];
      for (let gName of genres) {
        const trimmed = gName.trim();
        if (!trimmed) continue;
        await db.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [trimmed]);
        const genRow = await db.get('SELECT id FROM genres WHERE name = ?', [trimmed]);
        await db.run('INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?, ?)', [id, genRow.id]);
      }

      added++;
      if (added % 50 === 0) {
        console.log(`[scanner] ⏳ ${added} nuevas canciones añadidas...`);
      }
    } catch (err) {
      console.error('[scanner] Error procesando archivo:', file, err.message);
      errors++;
    }
  }

  console.log(`[scanner] ✅ Escaneo completado: +${added} añadidas, ${skipped} existentes, ${errors} errores`);
}

export async function rescanLibrary() {
  console.log('[scanner] 🔄 Reseteando y reescaneando biblioteca completa...');
  
  // Eliminar datos existentes en orden inverso por claves foráneas
  await db.run('DELETE FROM playlist_songs');
  await db.run('DELETE FROM playlists');
  await db.run('DELETE FROM user_song_interactions');
  await db.run('DELETE FROM user_artist_interactions');
  await db.run('DELETE FROM song_genres');
  await db.run('DELETE FROM song_artists');
  await db.run('DELETE FROM songs');
  await db.run('DELETE FROM albums');
  await db.run('DELETE FROM genres');
  await db.run('DELETE FROM artists');
  
  // Reimportar desde cache y escanear
  const { importSongsFromCache } = await import('./db.js');
  await importSongsFromCache();
  await scanLibrary();
  
  console.log('[scanner] ✅ Rescan completo finalizado');
}