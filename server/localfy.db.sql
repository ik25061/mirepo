BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "album_artists" (
	"album_id"	INTEGER,
	"artist_id"	INTEGER,
	"is_main"	INTEGER DEFAULT 0 CHECK("is_main" IN (0, 1)),
	PRIMARY KEY("album_id","artist_id"),
	FOREIGN KEY("album_id") REFERENCES "albums"("id") ON DELETE CASCADE,
	FOREIGN KEY("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "albums" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"year"	INTEGER,
	"cover_path"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"main_artist_id"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("name","year"),
	FOREIGN KEY("main_artist_id") REFERENCES "artists"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "artists" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "audio_metadata" (
	"song_id"	TEXT,
	"bitrate"	INTEGER,
	"sample_rate"	INTEGER,
	"channels"	INTEGER,
	"codec"	TEXT,
	"filesize"	INTEGER,
	PRIMARY KEY("song_id"),
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "config" (
	"key"	TEXT,
	"value"	TEXT,
	PRIMARY KEY("key")
);
CREATE TABLE IF NOT EXISTS "file_integrity" (
	"song_id"	TEXT,
	"last_checked"	TIMESTAMP,
	"exists_on_disk"	INTEGER DEFAULT 1 CHECK("exists_on_disk" IN (0, 1)),
	PRIMARY KEY("song_id"),
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "genres" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "lyrics" (
	"song_id"	TEXT,
	"text"	TEXT,
	"synced_text"	TEXT,
	"translated_text"	TEXT,
	"language"	TEXT DEFAULT 'es',
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("song_id"),
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "moods" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "play_history" (
	"id"	INTEGER,
	"user_id"	INTEGER,
	"song_id"	TEXT,
	"played_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "playlist_songs" (
	"playlist_id"	TEXT,
	"song_id"	TEXT,
	"position"	INTEGER NOT NULL,
	"added_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("playlist_id","song_id"),
	FOREIGN KEY("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE,
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "playlists" (
	"id"	TEXT,
	"name"	TEXT NOT NULL,
	"description"	TEXT,
	"user_id"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "song_artists" (
	"song_id"	TEXT,
	"artist_id"	INTEGER,
	"is_main"	INTEGER DEFAULT 0 CHECK("is_main" IN (0, 1)),
	PRIMARY KEY("song_id","artist_id"),
	FOREIGN KEY("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE,
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "song_genres" (
	"song_id"	TEXT,
	"genre_id"	INTEGER,
	PRIMARY KEY("song_id","genre_id"),
	FOREIGN KEY("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE,
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "song_moods" (
	"song_id"	TEXT,
	"mood_id"	INTEGER,
	PRIMARY KEY("song_id","mood_id"),
	FOREIGN KEY("mood_id") REFERENCES "moods"("id") ON DELETE CASCADE,
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "songs" (
	"id"	TEXT,
	"title"	TEXT NOT NULL,
	"relPath"	TEXT NOT NULL UNIQUE,
	"duration"	INTEGER,
	"track"	INTEGER,
	"disc"	INTEGER,
	"hasLyrics"	INTEGER DEFAULT 0 CHECK("hasLyrics" IN (0, 1)),
	"album_id"	INTEGER,
	"file_hash"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY("album_id") REFERENCES "albums"("id") ON DELETE SET NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS "songs_fts" USING fts5(title, artists_names, album_name, content='');
CREATE TABLE IF NOT EXISTS "songs_fts_config" (
	"k"	TEXT,
	"v"	TEXT,
	PRIMARY KEY("k")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "songs_fts_data" (
	"id"	INTEGER,
	"block"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "songs_fts_docsize" (
	"id"	INTEGER,
	"sz"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "songs_fts_idx" (
	"segid"	INTEGER,
	"term"	TEXT,
	"pgno"	INTEGER,
	PRIMARY KEY("segid","term")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "user_artist_interactions" (
	"user_id"	INTEGER,
	"artist_id"	INTEGER,
	"interaction_type"	TEXT CHECK("interaction_type" IN ('FAVORITE', 'HIDE')),
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("user_id","artist_id"),
	FOREIGN KEY("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "user_favorite_albums" (
	"user_id"	INTEGER,
	"album_id"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("user_id","album_id"),
	FOREIGN KEY("album_id") REFERENCES "albums"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "user_favorite_genres" (
	"user_id"	INTEGER,
	"genre_id"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("user_id","genre_id"),
	FOREIGN KEY("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "user_song_interactions" (
	"user_id"	INTEGER,
	"song_id"	TEXT,
	"interaction_type"	TEXT CHECK("interaction_type" IN ('LIKE', 'HIDE')),
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("user_id","song_id"),
	FOREIGN KEY("song_id") REFERENCES "songs"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "users" (
	"id"	INTEGER,
	"username"	TEXT NOT NULL UNIQUE,
	"salt"	TEXT NOT NULL,
	"password_hash"	TEXT NOT NULL,
	"session_token"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE VIEW v_complete_songs AS
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
        al.cover_path,
        GROUP_CONCAT(art.name, ', ') AS artists_names,
        MAX(CASE WHEN sa.is_main = 1 THEN art.id END) AS main_artist_id,
        MAX(CASE WHEN sa.is_main = 1 THEN art.name END) AS main_artist_name
      FROM songs s
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN song_artists sa ON s.id = sa.song_id
      LEFT JOIN artists art ON sa.artist_id = art.id
      GROUP BY s.id;
CREATE VIEW v_playlist_details AS
      SELECT
        ps.playlist_id,
        p.name AS playlist_name,
        p.user_id AS owner_id,
        ps.position,
        vcs.*
      FROM playlist_songs ps
      JOIN playlists p ON ps.playlist_id = p.id
      JOIN v_complete_songs vcs ON ps.song_id = vcs.song_id
      ORDER BY ps.playlist_id, ps.position;
CREATE INDEX IF NOT EXISTS "idx_albums_name" ON "albums" (
	"name"
);
CREATE INDEX IF NOT EXISTS "idx_albums_year" ON "albums" (
	"year"
);
CREATE INDEX IF NOT EXISTS "idx_artists_name" ON "artists" (
	"name"
);
CREATE INDEX IF NOT EXISTS "idx_play_history_user_time" ON "play_history" (
	"user_id",
	"played_at"
);
CREATE INDEX IF NOT EXISTS "idx_song_artists_artist" ON "song_artists" (
	"artist_id"
);
CREATE INDEX IF NOT EXISTS "idx_song_genres_genre" ON "song_genres" (
	"genre_id"
);
CREATE INDEX IF NOT EXISTS "idx_songs_relpath" ON "songs" (
	"relPath"
);
CREATE INDEX IF NOT EXISTS "idx_songs_title" ON "songs" (
	"title"
);
CREATE TRIGGER update_hasLyrics_delete AFTER DELETE ON lyrics
    BEGIN UPDATE songs SET hasLyrics = 0 WHERE id = OLD.song_id; END;
CREATE TRIGGER update_hasLyrics_insert AFTER INSERT ON lyrics
    BEGIN UPDATE songs SET hasLyrics = 1 WHERE id = NEW.song_id; END;
COMMIT;
