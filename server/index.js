import express from 'express';
import cors from 'cors';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initDatabase, db, setSongInteraction, getUserInteractions, getUserByToken, getUserById, getAllUsers } from './db.js';
import { scanLibrary, rescanLibrary, MUSIC_DIR } from './scanner.js';
import * as dbMethods from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Servir archivos de música estáticos
app.use('/songs', express.static(MUSIC_DIR));

// ============================================================
// AUTENTICACIÓN (login/register/logout via SQLite)
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const user = await dbMethods.findUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar nuevo token de sesión
    const token = crypto.randomBytes(32).toString('hex');
    await dbMethods.updateUserSession(user.id, token);

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const newUser = await dbMethods.createUser(username, password);
    const token = crypto.randomBytes(32).toString('hex');
    await dbMethods.updateUserSession(newUser.id, token);

    res.json({
      success: true,
      token,
      user: { id: newUser.id, username: newUser.username }
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed') || err.message === 'El usuario ya existe') {
      return res.status(409).json({ error: 'El usuario ya existe' });
    }
    console.error('[auth/register]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    const user = await dbMethods.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    res.json({
      success: true,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('[auth/verify]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { token } = req.body;
    if (token) {
      await dbMethods.clearUserSession(token);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/logout]', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ALGORITMO CORE: BIBLIOTECA ALEATORIA INFINITA
// ============================================================
// 
// Características:
// - Devuelve bloques de 100 canciones para infinite scroll
// - Excluye canciones con HIDE (dislike)
// - Excluye canciones de artistas ocultos
// - Orden pseudoaleatorio CONSISTENTE por sesión (seed)
// - No repite canciones hasta agotar el catálogo visible
//
// El frontend debe pasar la misma 'seed' en cada petición de la sesión.
// seed = Math.random().toString(36).substring(7) (se genera al montar el componente)
// offset = se incrementa en 100 cada vez que se cargan más
//
app.get('/api/library', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId, 10) || 0;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    const likedOnly = req.query.liked === 'true';
    const sessionSeed = req.query.seed || `localfy_${userId || 'anon'}_${new Date().toISOString().slice(0, 10)}`;

    // 1. Obtener interacciones del usuario
    const { likes, hides } = await getUserInteractions(userId);

    // 2. Obtener artistas ocultos
    const hiddenArtists = await dbMethods.getHiddenArtists(userId);

    // 3. Construir consulta base excluyendo hides y artistas ocultos
    let whereConditions = [];
    let queryParams = [];

    // Excluir canciones con HIDE
    if (hides.size > 0) {
      const hidePlaceholders = Array.from(hides, () => '?').join(',');
      whereConditions.push(`v.song_id NOT IN (${hidePlaceholders})`);
      queryParams.push(...hides);
    }

    // Excluir artistas ocultos
    if (hiddenArtists.size > 0) {
      const artistPlaceholders = Array.from(hiddenArtists, () => '?').join(',');
      whereConditions.push(`v.main_artist_name NOT IN (${artistPlaceholders})`);
      queryParams.push(...hiddenArtists);
    }

    // Filtrar solo canciones con like si se solicita
    if (likedOnly) {
      if (likes.size === 0) {
        return res.json({
          songs: [],
          pagination: { offset: 0, limit, total: 0, hasMore: false },
          likedSongIds: [...likes]
        });
      }
      const likePlaceholders = Array.from(likes, () => '?').join(',');
      whereConditions.push(`v.song_id IN (${likePlaceholders})`);
      queryParams.push(...likes);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 4. Generar seed numérica consistente para el orden aleatorio
    const seedHash = crypto.createHash('md5').update(sessionSeed).digest('hex');
    const numericModifier = parseInt(seedHash.slice(0, 8), 16) || 1;

    // 5. Contar total visible
    const countRow = await db.get(
      `SELECT COUNT(*) as total FROM v_complete_songs v ${whereClause}`,
      queryParams
    );
    const total = countRow.total;

    // 6. Obtener página con orden pseudoaleatorio determinista
    // Usamos SUBSTR del song_id para generar un orden reproducible
    const sql = `
      SELECT v.* FROM v_complete_songs v
      ${whereClause}
      ORDER BY (SUBSTR(v.song_id, 1, 4) * ${numericModifier} + CAST(SUBSTR(v.song_id, 5, 2) AS INTEGER) * 7) % 100000
      LIMIT ? OFFSET ?
    `;
    queryParams.push(limit, offset);

    const songs = await db.all(sql, queryParams);

    // Marcar cuáles tienen "Me gusta"
    const processedSongs = songs.map(s => ({
      song_id: s.song_id,
      song_title: s.song_title,
      relative_path: s.relative_path,
      duration: s.duration,
      track: s.track,
      hasLyrics: s.hasLyrics,
      album_id: s.album_id,
      album_name: s.album_name,
      album_year: s.album_year,
      artists_names: s.artists_names,
      main_artist_id: s.main_artist_id,
      main_artist_name: s.main_artist_name,
      genre_names: s.genre_names,
      liked: likes.has(s.song_id)
    }));

    res.json({
      songs: processedSongs,
      likedSongIds: [...likes],
      pagination: {
        offset,
        limit,
        total,
        hasMore: offset + limit < total
      }
    });
  } catch (err) {
    console.error('[api/library] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINTS DESACOPLADOS CON PAGINACIÓN
// ============================================================

// 1. ARTISTAS
app.get('/api/artists', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const rows = await db.all(`
      SELECT a.id, a.name, COUNT(DISTINCT sa.song_id) as total_songs,
        (SELECT s2.id FROM songs s2 JOIN song_artists sa3 ON sa3.song_id = s2.id WHERE sa3.artist_id = a.id LIMIT 1) AS sample_song_id
      FROM artists a
      LEFT JOIN song_artists sa ON a.id = sa.artist_id
      GROUP BY a.id
      ORDER BY a.name ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await db.get('SELECT COUNT(*) as total FROM artists');
    
    res.json({
      artists: rows,
      pagination: { offset, limit, total: countRow.total, hasMore: offset + limit < countRow.total }
    });
  } catch (err) { 
    console.error('[api/artists] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// Canciones de un artista específico
app.get('/api/artists/:id/songs', async (req, res) => {
  try {
    const songs = await db.all(`
      SELECT v.* FROM v_complete_songs v
      JOIN song_artists sa ON v.song_id = sa.song_id
      WHERE sa.artist_id = ?
      GROUP BY v.song_id
      ORDER BY v.album_name ASC, v.track ASC
    `, [req.params.id]);
    
    // Obtener interacciones del usuario para marcar likes
    const userId = parseInt(req.query.userId, 10) || 0;
    const { likes } = await getUserInteractions(userId);
    
    const processed = songs.map(s => ({ ...s, liked: likes.has(s.song_id) }));
    
    res.json({ songs: processed });
  } catch (err) { 
    console.error('[api/artists/:id/songs] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// 2. ÁLBUMES
app.get('/api/albums', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const rows = await db.all(`
      SELECT al.id, al.name, al.year, art.name as artist_name, COUNT(s.id) as total_songs,
        MIN(s.id) AS sample_song_id
      FROM albums al
      LEFT JOIN artists art ON al.main_artist_id = art.id
      LEFT JOIN songs s ON al.id = s.album_id
      GROUP BY al.id
      ORDER BY al.name ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await db.get('SELECT COUNT(*) as total FROM albums');
    
    res.json({
      albums: rows,
      pagination: { offset, limit, total: countRow.total, hasMore: offset + limit < countRow.total }
    });
  } catch (err) { 
    console.error('[api/albums] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

app.get('/api/albums/:id/songs', async (req, res) => {
  try {
    const songs = await db.all(
      'SELECT * FROM v_complete_songs WHERE album_id = ? ORDER BY track ASC',
      [req.params.id]
    );
    
    const userId = parseInt(req.query.userId, 10) || 0;
    const { likes } = await getUserInteractions(userId);
    const processed = songs.map(s => ({ ...s, liked: likes.has(s.song_id) }));
    
    res.json({ songs: processed });
  } catch (err) { 
    console.error('[api/albums/:id/songs] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// 3. GÉNEROS
app.get('/api/genres', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const rows = await db.all(`
      SELECT g.id, g.name, COUNT(sg.song_id) as total_songs
      FROM genres g
      LEFT JOIN song_genres sg ON g.id = sg.genre_id
      GROUP BY g.id
      ORDER BY g.name ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await db.get('SELECT COUNT(*) as total FROM genres');
    
    res.json({
      genres: rows,
      pagination: { offset, limit, total: countRow.total, hasMore: offset + limit < countRow.total }
    });
  } catch (err) { 
    console.error('[api/genres] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

app.get('/api/genres/:id/songs', async (req, res) => {
  try {
    const songs = await db.all(`
      SELECT v.* FROM v_complete_songs v
      JOIN song_genres sg ON v.song_id = sg.song_id
      WHERE sg.genre_id = ?
      GROUP BY v.song_id
      ORDER BY v.album_name ASC, v.track ASC
    `, [req.params.id]);
    
    const userId = parseInt(req.query.userId, 10) || 0;
    const { likes } = await getUserInteractions(userId);
    const processed = songs.map(s => ({ ...s, liked: likes.has(s.song_id) }));
    
    res.json({ songs: processed });
  } catch (err) { 
    console.error('[api/genres/:id/songs] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// 4. AÑOS
app.get('/api/years', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const rows = await db.all(`
      SELECT al.year, COUNT(DISTINCT s.id) as total_songs
      FROM albums al
      JOIN songs s ON al.id = s.album_id
      WHERE al.year IS NOT NULL
      GROUP BY al.year
      ORDER BY al.year DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await db.get('SELECT COUNT(DISTINCT year) as total FROM albums WHERE year IS NOT NULL');
    
    res.json({
      years: rows,
      pagination: { offset, limit, total: countRow.total, hasMore: offset + limit < countRow.total }
    });
  } catch (err) { 
    console.error('[api/years] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

app.get('/api/years/:year/songs', async (req, res) => {
  try {
    const songs = await db.all(
      'SELECT * FROM v_complete_songs WHERE album_year = ? ORDER BY album_name ASC, track ASC',
      [req.params.year]
    );
    
    const userId = parseInt(req.query.userId, 10) || 0;
    const { likes } = await getUserInteractions(userId);
    const processed = songs.map(s => ({ ...s, liked: likes.has(s.song_id) }));
    
    res.json({ songs: processed });
  } catch (err) { 
    console.error('[api/years/:year/songs] Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// ============================================================
// BÚSQUEDA
// ============================================================
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query || query.length < 2) {
      return res.json({ songs: [], total: 0 });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const userId = parseInt(req.query.userId, 10) || 0;

    const result = await dbMethods.searchSongs(query, limit, offset);
    const { likes } = await getUserInteractions(userId);

    const processed = result.songs.map(s => ({ ...s, liked: likes.has(s.song_id) }));

    res.json({
      songs: processed,
      total: result.total,
      pagination: { offset, limit, total: result.total, hasMore: offset + limit < result.total }
    });
  } catch (err) {
    console.error('[api/search] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// INTERACCIONES (Likes / Hides)
// ============================================================
app.post('/api/interactions', async (req, res) => {
  const { userId, songId, type } = req.body;
  // type: 'LIKE', 'HIDE', o 'NONE' (para eliminar la interacción)
  if (!userId || !songId || !type) {
    return res.status(400).json({ error: 'Faltan parámetros: userId, songId, type' });
  }
  try {
    await setSongInteraction(userId, songId, type);
    const { likes } = await getUserInteractions(userId);
    res.json({ success: true, likedSongIds: [...likes] });
  } catch (err) {
    console.error('[api/interactions] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Obtener todas las canciones con like del usuario
app.get('/api/liked-songs', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId, 10) || 0;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;

    const { likes } = await getUserInteractions(userId);
    if (likes.size === 0) {
      return res.json({ songs: [], pagination: { offset, limit, total: 0, hasMore: false } });
    }

    const likePlaceholders = Array.from(likes, () => '?').join(',');
    const queryParams = [...likes, limit, offset];

    // Ordenar por más reciente (usando la fecha de creación de la interacción)
    const songs = await db.all(`
      SELECT v.*, usi.created_at as liked_at
      FROM v_complete_songs v
      JOIN user_song_interactions usi ON v.song_id = usi.song_id AND usi.interaction_type = 'LIKE'
      WHERE usi.user_id = ? AND v.song_id IN (${likePlaceholders})
      ORDER BY usi.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, ...likes, limit, offset]);

    const countRow = await db.get(
      'SELECT COUNT(*) as total FROM user_song_interactions WHERE user_id = ? AND interaction_type = ?',
      [userId, 'LIKE']
    );

    const processed = songs.map(s => ({ ...s, liked: true }));

    res.json({
      songs: processed,
      likedSongIds: [...likes],
      pagination: { offset, limit, total: countRow.total, hasMore: offset + limit < countRow.total }
    });
  } catch (err) {
    console.error('[api/liked-songs] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ARTISTAS FAVORITOS Y OCULTOS (gestionados en SQLite)
// ============================================================

app.get('/api/favorite-artists', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId, 10) || 0;
    const artists = await dbMethods.getFavoriteArtists(userId);
    res.json({ artists });
  } catch (err) {
    console.error('[api/favorite-artists] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorite-artists/toggle', async (req, res) => {
  try {
    const { artist, userId } = req.body;
    if (!artist) return res.status(400).json({ error: 'Artista requerido' });
    const artists = await dbMethods.toggleFavoriteArtist(artist, userId || 0);
    res.json({ success: true, artists });
  } catch (err) {
    console.error('[api/favorite-artists/toggle] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/artists/hide', async (req, res) => {
  const { artist, userId } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  try {
    await dbMethods.setArtistHidden(artist, true, userId || 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/artists/hide] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/artists/unhide', async (req, res) => {
  const { artist, userId } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  try {
    await dbMethods.setArtistHidden(artist, false, userId || 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/artists/unhide] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PLAYLISTS
// ============================================================

app.get('/api/playlists', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId, 10) || 0;
    const playlists = await dbMethods.getPlaylists(userId || null);
    res.json({ playlists });
  } catch (err) {
    console.error('[api/playlists] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/playlists/:id', async (req, res) => {
  try {
    const playlist = await dbMethods.getPlaylist(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });
    
    const songs = await dbMethods.getPlaylistSongs(req.params.id);
    
    const userId = parseInt(req.query.userId, 10) || 0;
    const { likes } = await getUserInteractions(userId);
    const processed = songs.map(s => ({ ...s, liked: likes.has(s.song_id) }));
    
    res.json({ playlist, songs: processed });
  } catch (err) {
    console.error('[api/playlists/:id] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/playlists', async (req, res) => {
  try {
    const { name, description, userId } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre de playlist requerido' });
    const playlist = await dbMethods.createPlaylist(name, description, userId || null);
    res.json({ playlist });
  } catch (err) {
    console.error('[api/playlists] POST Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/playlists/:id/songs', async (req, res) => {
  try {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId requerido' });
    const songs = await dbMethods.addSongToPlaylist(req.params.id, songId);
    res.json({ songs });
  } catch (err) {
    console.error('[api/playlists/:id/songs] POST Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/playlists/:id/songs/:songId', async (req, res) => {
  try {
    const songs = await dbMethods.removeSongFromPlaylist(req.params.id, req.params.songId);
    res.json({ songs });
  } catch (err) {
    console.error('[api/playlists/:id/songs] DELETE Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await dbMethods.deletePlaylist(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api/playlists/:id] DELETE Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// LETRAS (Lyrics)
// ============================================================
app.get('/api/lyrics/:songId', async (req, res) => {
  try {
    const song = await db.get('SELECT relPath FROM songs WHERE id = ?', [req.params.songId]);
    if (!song) return res.status(404).json({ error: 'Canción no encontrada' });

    // Buscar archivo .lrc correspondiente
    const mp3Path = path.join(MUSIC_DIR, song.relPath);
    const lrcPath = mp3Path.slice(0, -path.extname(mp3Path).length) + '.lrc';

    if (fs.existsSync(lrcPath)) {
      const lrcContent = fs.readFileSync(lrcPath, 'utf-8');
      return res.json({ synced: true, lyrics: lrcContent });
    }

    // Si no hay .lrc, buscar en lyrics_cache.json
    const lyricsCachePath = path.join(__dirname, 'lyrics_cache.json');
    if (fs.existsSync(lyricsCachePath)) {
      try {
        const cache = JSON.parse(fs.readFileSync(lyricsCachePath, 'utf-8'));
        if (cache[req.params.songId]) {
          return res.json({ synced: false, lyrics: cache[req.params.songId] });
        }
      } catch {}
    }

    res.json({ synced: false, lyrics: null, message: 'No hay letras disponibles' });
  } catch (err) {
    console.error('[api/lyrics] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SISTEMA DE SINCRONIZACIÓN (para App Android offline)
// ============================================================
app.post('/api/sync', async (req, res) => {
  const { userId, queue } = req.body;
  if (!userId || !Array.isArray(queue)) {
    return res.status(400).json({ error: 'Faltan parámetros: userId, queue' });
  }

  let processed = 0;
  let errors = 0;

  try {
    for (const action of queue) {
      try {
        if (action.songId && action.type) {
          await setSongInteraction(userId, action.songId, action.type);
          processed++;
        }
      } catch (err) {
        console.warn('[api/sync] Error procesando acción:', action, err.message);
        errors++;
      }
    }

    res.json({
      success: true,
      message: `Sincronización completada: ${processed} procesadas, ${errors} errores`,
      processed,
      errors
    });
  } catch (err) {
    console.error('[api/sync] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// IMPORTACIÓN DE DATOS EXISTENTES
// ============================================================
app.post('/api/import', async (req, res) => {
  try {
    console.log('[api/import] 🚀 Iniciando importación de datos existentes...');
    
    const results = {
      users: await dbMethods.importUsersFromJSON(),
      songs: await dbMethods.importSongsFromCache(),
      prefs: await dbMethods.importPrefsFromJSON()
    };

    // Si no se importaron canciones del cache, ejecutar scan
    if (results.songs.imported === 0) {
      console.log('[api/import] 🔍 No se importaron canciones del cache, escaneando directorio...');
      await scanLibrary();
    }

    console.log('[api/import] ✅ Importación completada:', JSON.stringify(results));
    res.json({ success: true, results });
  } catch (err) {
    console.error('[api/import] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ESTADÍSTICAS DE LA BIBLIOTECA
// ============================================================
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await dbMethods.getLibraryStats();
    res.json(stats);
  } catch (err) {
    console.error('[api/stats] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// RESCAN
// ============================================================
app.post('/api/rescan', async (_req, res) => {
  try {
    await rescanLibrary();
    const stats = await dbMethods.getLibraryStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error('[api/rescan] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// TEST y CONFIG
// ============================================================
app.get('/api/test', async (req, res) => {
  try {
    const stats = await dbMethods.getLibraryStats();
    res.json({
      status: 'ok',
      server: 'localfy',
      libraryReady: true,
      stats
    });
  } catch (err) {
    res.json({ status: 'ok', server: 'localfy' });
  }
});

app.get('/api/config/ip', (req, res) => {
  const lanIp = getLocalLanIp();
  res.json({
    ip: lanIp,
    port: PORT,
    serverUrl: `http://${lanIp}:${PORT}`,
    allIps: getAllLocalIps()
  });
});

// ============================================================
// UTILIDADES DE RED
// ============================================================
function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('172.')) {
        return iface.address;
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
        return iface.address;
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function getAllLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
const PORT = process.env.PORT || 5002;

async function start() {
  try {
    console.log('🚀 Iniciando servidor Localfy...');
    
    // 1. Inicializar base de datos SQLite (rápido, crea tablas si no existen)
    await initDatabase();
    
    // 2. Iniciar servidor HTTP INMEDIATAMENTE (no esperar escaneo)
    const lanIP = getLocalLanIp();
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('═'.repeat(50));
      console.log('  🎵 Localfy Engine corriendo');
      console.log('═'.repeat(50));
      console.log(`   🌐 Red:    http://${lanIP}:${PORT}`);
      console.log(`   ⚡ Local:  http://localhost:${PORT}`);
      console.log(`   📡 Puerto: ${PORT}`);
      console.log('');
    });
    
    // 3. Importar datos existentes en segundo plano (sin bloquear el servidor)
    console.log('[server] 📦 Importando datos existentes en segundo plano...');
    
    // Importar usuarios desde users.json
    try { await dbMethods.importUsersFromJSON(); } catch (err) {
      console.warn('[server] ⚠️ Error importando usuarios:', err.message);
    }
    
    // Importar canciones desde songs_cache.json
    try { await dbMethods.importSongsFromCache(); } catch (err) {
      console.warn('[server] ⚠️ Error importando cache:', err.message);
    }
    
    // Escanear directorio de música (para añadir canciones faltantes)
    try { await scanLibrary(); } catch (err) {
      console.error('[server] ⚠️ Error en escaneo:', err.message);
    }
    
    // Importar preferencias desde prefs.json
    try { await dbMethods.importPrefsFromJSON(); } catch (err) {
      console.warn('[server] ⚠️ Error importando preferencias:', err.message);
    }
    
    // Mostrar estadísticas finales
    try {
      const stats = await dbMethods.getLibraryStats();
      console.log('');
      console.log('📊 Estadísticas de la biblioteca:');
      console.log(`   🎵 Canciones: ${stats.songs}`);
      console.log(`   🎤 Artistas:  ${stats.artists}`);
      console.log(`   💿 Álbumes:   ${stats.albums}`);
      console.log(`   🏷️ Géneros:   ${stats.genres}`);
      console.log(`   👥 Usuarios:  ${stats.users}`);
      console.log('');
    } catch {}
    
    console.log('[server] ✅ Inicialización completa');
    
  } catch (err) {
    console.error('❌ Error fatal al iniciar el servidor:', err);
    process.exit(1);
  }
}

start();