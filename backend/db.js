import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("[db] No se encontró DATABASE_URL. Las preferencias no se guardarán.");
}

const sql = connectionString ? neon(connectionString) : null;

/**
 * Inicializa las tablas en Neon si no existen
 */
export async function initDatabase() {
  if (!sql) return;
  
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS song_prefs (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      song_id TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      liked BOOLEAN DEFAULT FALSE,
      hidden BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, song_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS artist_prefs (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      artist TEXT NOT NULL,
      hidden BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, artist)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS album_prefs (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      album TEXT NOT NULL,
      artist TEXT,
      hidden BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, album)
    )
  `;

  // Índices para rendimiento
  await sql`
    CREATE INDEX IF NOT EXISTS idx_song_prefs_user_song ON song_prefs(user_id, song_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_artist_prefs_user ON artist_prefs(user_id, artist)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_album_prefs_user ON album_prefs(user_id, album)
  `;

  console.log("[db] Tablas inicializadas correctamente");
}

/**
 * Obtiene todas las preferencias de un usuario
 */
export async function getUserPrefs(userId) {
  if (!sql || !userId) return { songPrefs: {}, hiddenArtists: [], hiddenAlbums: [] };

  const [songPrefs, artistPrefs, albumPrefs] = await Promise.all([
    sql`SELECT song_id, liked, hidden, rel_path, title, artist, album FROM song_prefs WHERE user_id = ${userId}`,
    sql`SELECT artist FROM artist_prefs WHERE user_id = ${userId} AND hidden = TRUE`,
    sql`SELECT album, artist FROM album_prefs WHERE user_id = ${userId} AND hidden = TRUE`
  ]);

  const songMap = {};
  for (const p of songPrefs) {
    songMap[p.song_id] = { liked: p.liked, hidden: p.hidden };
  }

  return {
    songPrefs: songMap,
    hiddenArtists: artistPrefs.map(a => a.artist),
    hiddenAlbums: albumPrefs.map(a => ({ album: a.album, artist: a.artist }))
  };
}

/**
 * Inserta o actualiza una preferencia de canción (like/hidden)
 */
export async function setSongPref(userId, song, field, value) {
  if (!sql || !userId) return;

  const { id: songId, relPath, title, artist, album } = song;

  switch (field) {
    case "liked":
      await sql`
        INSERT INTO song_prefs (user_id, song_id, rel_path, title, artist, album, liked, updated_at)
        VALUES (${userId}, ${songId}, ${relPath}, ${title}, ${artist}, ${album}, ${value}, NOW())
        ON CONFLICT (user_id, song_id) DO UPDATE
          SET liked = ${value}, 
              rel_path = EXCLUDED.rel_path,
              title = EXCLUDED.title,
              artist = EXCLUDED.artist,
              album = EXCLUDED.album,
              updated_at = NOW()
      `;
      break;
    case "hidden":
      await sql`
        INSERT INTO song_prefs (user_id, song_id, rel_path, title, artist, album, hidden, updated_at)
        VALUES (${userId}, ${songId}, ${relPath}, ${title}, ${artist}, ${album}, ${value}, NOW())
        ON CONFLICT (user_id, song_id) DO UPDATE
          SET hidden = ${value},
              rel_path = EXCLUDED.rel_path,
              title = EXCLUDED.title,
              artist = EXCLUDED.artist,
              album = EXCLUDED.album,
              updated_at = NOW()
      `;
      break;
    default:
      throw new Error("Campo inválido");
  }
}

/**
 * Marca un artista como oculto para un usuario
 */
export async function setArtistHidden(userId, artist, hidden = true) {
  if (!sql || !userId) return;
  await sql`
    INSERT INTO artist_prefs (user_id, artist, hidden, updated_at)
    VALUES (${userId}, ${artist}, ${hidden}, NOW())
    ON CONFLICT (user_id, artist) DO UPDATE
      SET hidden = ${hidden}, updated_at = NOW()
  `;
}

/**
 * Marca un álbum como oculto para un usuario
 */
export async function setAlbumHidden(userId, album, artist, hidden = true) {
  if (!sql || !userId) return;
  await sql`
    INSERT INTO album_prefs (user_id, album, artist, hidden, updated_at)
    VALUES (${userId}, ${album}, ${artist}, ${hidden}, NOW())
    ON CONFLICT (user_id, album) DO UPDATE
      SET hidden = ${hidden}, updated_at = NOW()
  `;
}

/**
 * Obtiene o crea un usuario
 */
export async function getOrCreateUser(profile) {
  if (!sql) return null;

  const { id, email, name, picture } = profile;

  await sql`
    INSERT INTO users (id, email, name, picture, created_at)
    VALUES (${id}, ${email}, ${name}, ${picture}, NOW())
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          picture = EXCLUDED.picture
  `;

  const [user] = await sql`SELECT * FROM users WHERE id = ${id}`;
  return user;
}

/**
 * Obtiene un usuario por ID
 */
export async function getUserById(userId) {
  if (!sql || !userId) return null;
  const [user] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  return user;
}

export { sql };