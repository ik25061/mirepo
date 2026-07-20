/**
 * ============================================================
 * DB - BASE DE DATOS (SQLite)
 * ============================================================
 * 
 * Sistema completo de gestión de base de datos SQLite para Localfy.
 * Maneja usuarios, canciones, artistas, álbumes, géneros, playlists,
 * interacciones (likes/hides) y preferencias de artista.
 */
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'localfy.db');
const SONGS_CACHE_PATH = path.join(__dirname, 'songs_cache.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const PREFS_PATH = path.join(__dirname, 'prefs.json');

let db = null;

// ============================================================
// 1. INICIALIZACIÓN
// ============================================================

export async function initDatabase() {
  console.log('[db] 📚 Inicializando base de datos SQLite...');
  
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Activar soporte estricto de claves foráneas
  await db.exec('PRAGMA foreign_keys = ON;');

  // 1. Tabla Usuarios
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      session_token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabla Artistas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Tabla Álbumes
  await db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      main_artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      year INTEGER,
      cover_path TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, main_artist_id)
    );
  `);

  // 4. Tabla Géneros
  await db.exec(`
    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Tabla Canciones
  await db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      relPath TEXT NOT NULL,
      duration INTEGER,
      track INTEGER,
      hasLyrics INTEGER DEFAULT 0 CHECK(hasLyrics IN (0,1)),
      album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. Relación Canción-Artistas (Colaboraciones)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS song_artists (
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      is_main INTEGER DEFAULT 0 CHECK(is_main IN (0,1)),
      PRIMARY KEY (song_id, artist_id)
    );
  `);

  // 7. Relación Canción-Género
  await db.exec(`
    CREATE TABLE IF NOT EXISTS song_genres (
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
      PRIMARY KEY (song_id, genre_id)
    );
  `);

  // 8. Interacciones de Usuario con Canciones (Likes / Hides)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_song_interactions (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      interaction_type TEXT CHECK(interaction_type IN ('LIKE', 'HIDE')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, song_id)
    );
  `);

  // 9. Interacciones de Usuario con Artistas (Favoritos / Ocultos)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_artist_interactions (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      interaction_type TEXT CHECK(interaction_type IN ('FAVORITE', 'HIDE')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, artist_id)
    );
  `);

  // 10. Playlists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 11. Canciones en Playlists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id TEXT REFERENCES playlists(id) ON DELETE CASCADE,
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (playlist_id, song_id)
    );
  `);

  // ÍNDICES PARA CRUCES RÁPIDOS
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_songs_relpath ON songs(relPath);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_name ON albums(name);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_lookup ON user_song_interactions(user_id, interaction_type);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_artist_interactions ON user_artist_interactions(user_id, interaction_type);`);

  // ============================================================
  // VISTAS DE CONSULTA CENTRALIZADA
  // ============================================================
  
  // Drop views first to ensure they are recreated with latest schema
  try {
    await db.exec('DROP VIEW IF EXISTS v_complete_songs');
    await db.exec('DROP VIEW IF EXISTS v_artists_with_counts');
    await db.exec('DROP VIEW IF EXISTS v_albums_with_counts');
    await db.exec('DROP VIEW IF EXISTS v_genres_with_counts');
  } catch (e) {
    // Ignore errors if views don't exist
  }
  
  // Vista: Canción completa con álbum y artistas
  await db.exec(`
    CREATE VIEW IF NOT EXISTS v_complete_songs AS
    SELECT 
      s.id AS song_id,
      s.title AS song_title,
      s.relPath AS relative_path,
      s.duration,
      s.track,
      s.hasLyrics,
      al.id AS album_id,
      al.name AS album_name,
      al.year AS album_year,
      al.cover_path AS album_cover,
      GROUP_CONCAT(DISTINCT art.name, ', ') AS artists_names,
      MAX(CASE WHEN sa.is_main = 1 THEN art.id END) AS main_artist_id,
      MAX(CASE WHEN sa.is_main = 1 THEN art.name END) AS main_artist_name,
      (SELECT GROUP_CONCAT(DISTINCT g.name, ', ') FROM song_genres sg2 JOIN genres g ON g.id = sg2.genre_id WHERE sg2.song_id = s.id) AS genre_names
    FROM songs s
    LEFT JOIN albums al ON s.album_id = al.id
    LEFT JOIN song_artists sa ON s.id = sa.song_id
    LEFT JOIN artists art ON sa.artist_id = art.id
    GROUP BY s.id;
  `);

  // Vista: Artistas con conteo de canciones
  await db.exec(`
    CREATE VIEW IF NOT EXISTS v_artists_with_counts AS
    SELECT 
      a.id,
      a.name,
      COUNT(DISTINCT sa.song_id) AS total_songs,
      (SELECT s2.id FROM songs s2 JOIN song_artists sa3 ON sa3.song_id = s2.id WHERE sa3.artist_id = a.id AND s2.id IS NOT NULL LIMIT 1) AS sample_song_id
    FROM artists a
    LEFT JOIN song_artists sa ON a.id = sa.artist_id
    GROUP BY a.id;
  `);

  // Vista: Álbumes con conteo de canciones
  await db.exec(`
    CREATE VIEW IF NOT EXISTS v_albums_with_counts AS
    SELECT 
      al.id,
      al.name,
      al.year,
      al.main_artist_id,
      art.name AS artist_name,
      COUNT(s.id) AS total_songs,
      MIN(s.id) AS sample_song_id
    FROM albums al
    LEFT JOIN artists art ON al.main_artist_id = art.id
    LEFT JOIN songs s ON al.id = s.album_id
    GROUP BY al.id;
  `);

  // Vista: Géneros con conteo de canciones
  await db.exec(`
    CREATE VIEW IF NOT EXISTS v_genres_with_counts AS
    SELECT 
      g.id,
      g.name,
      COUNT(sg.song_id) AS total_songs
    FROM genres g
    LEFT JOIN song_genres sg ON g.id = sg.genre_id
    GROUP BY g.id;
  `);

  console.log('[db] ✅ SQLite, índices y vistas inicializados correctamente.');
  return true;
}

// ============================================================
// 2. USUARIOS (Autenticación)
// ============================================================

export async function createUser(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const res = await db.run(
    'INSERT INTO users (username, salt, password_hash) VALUES (?, ?, ?)',
    [username, salt, hash]
  );
  return { id: res.lastID, username };
}

export async function findUser(username, password) {
  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return null;
  const derived = crypto.scryptSync(password, user.salt, 64).toString('hex');
  return derived === user.password_hash ? user : null;
}

export async function getUserByToken(token) {
  return await db.get('SELECT * FROM users WHERE session_token = ?', [token]);
}

export async function getUserById(id) {
  return await db.get('SELECT id, username, session_token, created_at FROM users WHERE id = ?', [id]);
}

export async function updateUserSession(userId, token) {
  await db.run('UPDATE users SET session_token = ? WHERE id = ?', [token, userId]);
}

export async function clearUserSession(token) {
  await db.run('UPDATE users SET session_token = NULL WHERE session_token = ?', [token]);
}

export async function getAllUsers() {
  return await db.all('SELECT id, username, created_at FROM users ORDER BY id ASC');
}

export async function importUsersFromJSON() {
  try {
    if (!fs.existsSync(USERS_PATH)) return { imported: 0 };
    const data = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
    if (!data.users || !Array.isArray(data.users)) return { imported: 0 };
    
    let imported = 0;
    for (const u of data.users) {
      try {
        await db.run(
          'INSERT OR IGNORE INTO users (id, username, salt, password_hash, session_token, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [u.id, u.username, u.salt, u.password_hash, u.session_token || null, u.created_at || new Date().toISOString()]
        );
        imported++;
      } catch (err) {
        // Si falla por UNIQUE, intentar sin ID fijo
        if (err.message?.includes('UNIQUE')) {
          try {
            await db.run(
              'INSERT OR IGNORE INTO users (username, salt, password_hash, session_token, created_at) VALUES (?, ?, ?, ?, ?)',
              [u.username, u.salt, u.password_hash, u.session_token || null, u.created_at || new Date().toISOString()]
            );
            imported++;
          } catch {}
        }
      }
    }
    console.log(`[db] 👤 ${imported} usuarios importados desde users.json`);
    return { imported };
  } catch (err) {
    console.error('[db] Error importando usuarios:', err.message);
    return { imported: 0, error: err.message };
  }
}

// ============================================================
// 3. INTERACCIONES CON CANCIONES (Likes / Hides)
// ============================================================

export async function setSongInteraction(userId, songId, type) {
  if (type === 'NONE') {
    await db.run('DELETE FROM user_song_interactions WHERE user_id = ? AND song_id = ?', [userId, songId]);
  } else {
    await db.run(
      'INSERT OR REPLACE INTO user_song_interactions (user_id, song_id, interaction_type) VALUES (?, ?, ?)',
      [userId, songId, type]
    );
  }
}

export async function getUserInteractions(userId) {
  const rows = await db.all('SELECT song_id, interaction_type FROM user_song_interactions WHERE user_id = ?', [userId]);
  const likes = new Set();
  const hides = new Set();
  rows.forEach(r => {
    if (r.interaction_type === 'LIKE') likes.add(r.song_id);
    if (r.interaction_type === 'HIDE') hides.add(r.song_id);
  });
  return { likes, hides };
}

export async function getSongPrefs(userId) {
  const { likes, hides } = await getUserInteractions(userId);
  const prefs = {};
  for (const id of likes) prefs[id] = { liked: true };
  for (const id of hides) {
    if (!prefs[id]) prefs[id] = {};
    prefs[id].hidden = true;
  }
  return prefs;
}

export async function importPrefsFromJSON() {
  try {
    if (!fs.existsSync(PREFS_PATH)) return { imported: 0 };
    const data = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf-8'));
    
    let imported = 0;
    for (const [userId, userPrefs] of Object.entries(data)) {
      // Migrar interacciones de canciones (likes)
      if (userPrefs.songs) {
        for (const [songId, prefs] of Object.entries(userPrefs.songs)) {
          if (prefs.liked) {
            await db.run(
              'INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type) VALUES (?, ?, ?)',
              [parseInt(userId), songId, 'LIKE']
            );
            imported++;
          }
          if (prefs.hidden || prefs.deleted) {
            await db.run(
              'INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type) VALUES (?, ?, ?)',
              [parseInt(userId), songId, 'HIDE']
            );
            imported++;
          }
        }
      }
      // Migrar artistas ocultos
      if (userPrefs.artists) {
        for (const [artistName, hidden] of Object.entries(userPrefs.artists)) {
          if (hidden) {
            const artist = await db.get('SELECT id FROM artists WHERE name = ?', [artistName]);
            if (artist) {
              await db.run(
                'INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type) VALUES (?, ?, ?)',
                [parseInt(userId), artist.id, 'HIDE']
              );
              imported++;
            }
          }
        }
      }
      // Migrar artistas favoritos
      if (userPrefs.favoriteArtists && Array.isArray(userPrefs.favoriteArtists)) {
        for (const artistName of userPrefs.favoriteArtists) {
          const artist = await db.get('SELECT id FROM artists WHERE name = ?', [artistName]);
          if (artist) {
            await db.run(
              'INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type) VALUES (?, ?, ?)',
              [parseInt(userId), artist.id, 'FAVORITE']
            );
            imported++;
          }
        }
      }
    }
    console.log(`[db] ♻️ ${imported} preferencias migradas desde prefs.json`);
    return { imported };
  } catch (err) {
    console.error('[db] Error importando preferencias:', err.message);
    return { imported: 0, error: err.message };
  }
}

// ============================================================
// 4. ARTISTAS FAVORITOS Y OCULTOS
// ============================================================

export async function getFavoriteArtists(userId) {
  const rows = await db.all(`
    SELECT a.id, a.name
    FROM user_artist_interactions uai
    JOIN artists a ON a.id = uai.artist_id
    WHERE uai.user_id = ? AND uai.interaction_type = 'FAVORITE'
    ORDER BY a.name ASC
  `, [userId]);
  return rows.map(r => r.name);
}

export async function toggleFavoriteArtist(artistNameOrId, userId) {
  let artistId;
  if (typeof artistNameOrId === 'number' || /^\d+$/.test(artistNameOrId)) {
    artistId = artistNameOrId;
  } else {
    const artist = await db.get('SELECT id FROM artists WHERE name = ?', [artistNameOrId]);
    if (!artist) return [];
    artistId = artist.id;
  }

  const existing = await db.get(
    'SELECT id FROM user_artist_interactions WHERE user_id = ? AND artist_id = ? AND interaction_type = ?',
    [userId, artistId, 'FAVORITE']
  );

  if (existing) {
    await db.run(
      'DELETE FROM user_artist_interactions WHERE user_id = ? AND artist_id = ? AND interaction_type = ?',
      [userId, artistId, 'FAVORITE']
    );
  } else {
    await db.run(
      'INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type) VALUES (?, ?, ?)',
      [userId, artistId, 'FAVORITE']
    );
  }

  return await getFavoriteArtists(userId);
}

export async function setArtistHidden(artistName, hidden, userId) {
  const artist = await db.get('SELECT id FROM artists WHERE name = ?', [artistName]);
  if (!artist) return;

  if (hidden) {
    await db.run(
      'INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type) VALUES (?, ?, ?)',
      [userId, artist.id, 'HIDE']
    );
  } else {
    await db.run(
      'DELETE FROM user_artist_interactions WHERE user_id = ? AND artist_id = ? AND interaction_type = ?',
      [userId, artist.id, 'HIDE']
    );
  }
}

export async function getHiddenArtists(userId) {
  const rows = await db.all(`
    SELECT a.name
    FROM user_artist_interactions uai
    JOIN artists a ON a.id = uai.artist_id
    WHERE uai.user_id = ? AND uai.interaction_type = 'HIDE'
  `, [userId]);
  return new Set(rows.map(r => r.name));
}

// ============================================================
// 5. CANCIONES (Importación masiva)
// ============================================================

export async function importSongsFromCache() {
  try {
    if (!fs.existsSync(SONGS_CACHE_PATH)) {
      console.log('[db] ⚠️ No se encontró songs_cache.json');
      return { imported: 0 };
    }

    const data = JSON.parse(fs.readFileSync(SONGS_CACHE_PATH, 'utf-8'));
    const songs = data.songs || [];
    
    if (!Array.isArray(songs) || songs.length === 0) {
      console.log('[db] ⚠️ songs_cache.json vacío');
      return { imported: 0, total: 0 };
    }

    console.log(`[db] 📦 Importando ${songs.length} canciones desde songs_cache.json...`);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of songs) {
      try {
        const songId = item.id;
        if (!songId) { errors++; continue; }

        // Verificar si ya existe
        const existing = await db.get('SELECT id FROM songs WHERE id = ?', [songId]);
        if (existing) { skipped++; continue; }

        const title = item.title || 'Sin título';
        const relPath = item.relPath || '';
        const duration = item.duration || null;
        const track = item.track || null;
        const hasLyrics = item.hasLyrics ? 1 : 0;
        const year = item.year || null;
        const artistName = item.artist || 'Artista desconocido';
        const albumName = item.album || 'Álbum desconocido';
        const genres = Array.isArray(item.genre) ? item.genre : (item.genre ? [item.genre] : ['Sin género']);

        // Crear/obtener artista
        await db.run('INSERT OR IGNORE INTO artists (name) VALUES (?)', [artistName]);
        const artRow = await db.get('SELECT id FROM artists WHERE name = ?', [artistName]);
        
        // Crear/obtener álbum
        await db.run('INSERT OR IGNORE INTO albums (name, main_artist_id, year) VALUES (?, ?, ?)', 
          [albumName, artRow.id, year]);
        const albRow = await db.get('SELECT id FROM albums WHERE name = ? AND main_artist_id = ?', 
          [albumName, artRow.id]);

        // Insertar canción
        await db.run(
          'INSERT INTO songs (id, title, relPath, duration, track, hasLyrics, album_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [songId, title, relPath, duration, track, hasLyrics, albRow.id]
        );

        // Vincular artista principal
        await db.run('INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main) VALUES (?, ?, 1)', 
          [songId, artRow.id]);

        // Vincular géneros
        for (const gName of genres) {
          const trimmed = gName.trim();
          if (!trimmed) continue;
          await db.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [trimmed]);
          const genRow = await db.get('SELECT id FROM genres WHERE name = ?', [trimmed]);
          await db.run('INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?, ?)', 
            [songId, genRow.id]);
        }

        imported++;
      } catch (err) {
        console.error(`[db] Error importando canción ${item?.id || 'unknown'}:`, err.message);
        errors++;
      }
    }

    console.log(`[db] ✅ Importación completada: ${imported} nuevas, ${skipped} existentes, ${errors} errores`);
    return { imported, skipped, errors, total: songs.length };
  } catch (err) {
    console.error('[db] Error en importación masiva:', err.message);
    return { imported: 0, error: err.message };
  }
}

// ============================================================
// 6. BÚSQUEDA
// ============================================================

export async function searchSongs(query, limit = 50, offset = 0) {
  const searchTerm = `%${query}%`;
  const songs = await db.all(`
    SELECT v.* FROM v_complete_songs v
    WHERE v.song_title LIKE ? 
       OR v.artists_names LIKE ? 
       OR v.album_name LIKE ?
       OR v.genre_names LIKE ?
       OR v.main_artist_name LIKE ?
    ORDER BY v.song_title ASC
    LIMIT ? OFFSET ?
  `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit, offset]);
  
  const countRow = await db.get(`
    SELECT COUNT(*) as total FROM v_complete_songs v
    WHERE v.song_title LIKE ? 
       OR v.artists_names LIKE ? 
       OR v.album_name LIKE ?
       OR v.genre_names LIKE ?
       OR v.main_artist_name LIKE ?
  `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
  
  return { songs, total: countRow.total };
}

// ============================================================
// 7. PLAYLISTS
// ============================================================

export async function createPlaylist(name, description, userId) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await db.run(
    'INSERT INTO playlists (id, name, description, user_id) VALUES (?, ?, ?, ?)',
    [id, name.trim(), description?.trim() || '', userId]
  );
  return await db.get('SELECT * FROM playlists WHERE id = ?', [id]);
}

export async function getPlaylists(userId) {
  if (userId) {
    return await db.all(
      'SELECT * FROM playlists WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC',
      [userId]
    );
  }
  return await db.all('SELECT * FROM playlists ORDER BY created_at DESC');
}

export async function getPlaylist(id) {
  return await db.get('SELECT * FROM playlists WHERE id = ?', [id]);
}

export async function addSongToPlaylist(playlistId, songId) {
  const lastPos = await db.get(
    'SELECT COALESCE(MAX(position), -1) as maxPos FROM playlist_songs WHERE playlist_id = ?',
    [playlistId]
  );
  const position = lastPos ? lastPos.maxPos + 1 : 0;
  
  await db.run(
    'INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)',
    [playlistId, songId, position]
  );
  await db.run('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId]);
  return await getPlaylistSongs(playlistId);
}

export async function removeSongFromPlaylist(playlistId, songId) {
  await db.run(
    'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
    [playlistId, songId]
  );
  await db.run('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId]);
  return await getPlaylistSongs(playlistId);
}

export async function deletePlaylist(id) {
  await db.run('DELETE FROM playlists WHERE id = ?', [id]);
  return true;
}

export async function getPlaylistSongs(playlistId) {
  return await db.all(`
    SELECT v.*, ps.position, ps.added_at
    FROM playlist_songs ps
    JOIN v_complete_songs v ON v.song_id = ps.song_id
    WHERE ps.playlist_id = ?
    ORDER BY ps.position ASC
  `, [playlistId]);
}

export async function reorderPlaylistSongs(playlistId, songIds) {
  for (let i = 0; i < songIds.length; i++) {
    await db.run(
      'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?',
      [i, playlistId, songIds[i]]
    );
  }
  await db.run('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId]);
  return true;
}

// ============================================================
// 8. ESTADÍSTICAS
// ============================================================

export async function getLibraryStats() {
  const songCount = await db.get('SELECT COUNT(*) as count FROM songs');
  const artistCount = await db.get('SELECT COUNT(*) as count FROM artists');
  const albumCount = await db.get('SELECT COUNT(*) as count FROM albums');
  const genreCount = await db.get('SELECT COUNT(*) as count FROM genres');
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  
  return {
    songs: songCount.count,
    artists: artistCount.count,
    albums: albumCount.count,
    genres: genreCount.count,
    users: userCount.count
  };
}

// ============================================================
// 9. EXPORTAR EL OBJETO db
// ============================================================

export { db };