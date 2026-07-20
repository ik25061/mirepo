import json
import sqlite3
import os

DB_NAME = "localfy.db"
JSON_NAME = "songs_cache.json"

def init_db_settings(conn):
    # Forzar la activación de llaves foráneas en la sesión de SQLite
    conn.execute("PRAGMA foreign_keys = ON;")

def import_songs_cache():
    if not os.path.exists(JSON_NAME):
        print(f"Error: No se encontró el archivo {JSON_NAME}")
        return

    with open(JSON_NAME, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    songs = data.get("songs", [])
    print(f"Detectadas {len(songs)} canciones para procesar...")

    conn = sqlite3.connect(DB_NAME)
    init_db_settings(conn)
    cursor = conn.cursor()

    # Usamos una transacción para insertar todo de forma ultra rápida
    try:
        with conn:
            for idx, item in enumerate(songs, start=1):
                song_id = item["id"]
                title = item["title"]
                rel_path = item["relPath"]
                duration = item["duration"]
                track = item["track"]
                # Convertimos booleano Python (True/False) a INTEGER SQLite (1/0)
                has_lyrics = 1 if item["hasLyrics"] else 0 
                artist_name = item["artist"]
                album_name = item["album"]
                year = item["year"]
                genres = item.get("genre", [])

                # 1. Asegurar la existencia del Artista
                cursor.execute("""
                    INSERT INTO artists (name) 
                    VALUES (?) 
                    ON CONFLICT(name) DO UPDATE SET name=name;
                """, (artist_name,))
                
                cursor.execute("SELECT id FROM artists WHERE name = ?;", (artist_name,))
                artist_id = cursor.fetchone()[0]

                # 2. Asegurar la existencia del Álbum vinculado a su artista principal
                cursor.execute("""
                    INSERT INTO albums (name, main_artist_id, year) 
                    VALUES (?, ?, ?) 
                    ON CONFLICT(name, main_artist_id) DO UPDATE SET year=excluded.year;
                """, (album_name, artist_id, year))
                
                cursor.execute("SELECT id FROM albums WHERE name = ? AND main_artist_id = ?;", (album_name, artist_id))
                album_id = cursor.fetchone()[0]

                # 3. Insertar la Canción
                cursor.execute("""
                    INSERT INTO songs (id, title, relPath, duration, track, hasLyrics, album_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title=excluded.title,
                        relPath=excluded.relPath,
                        duration=excluded.duration,
                        track=excluded.track,
                        hasLyrics=excluded.hasLyrics,
                        album_id=excluded.album_id;
                """, (song_id, title, rel_path, duration, track, has_lyrics, album_id))

                # 4. Vincular la canción con su Artista Principal en la tabla intermedia
                cursor.execute("""
                    INSERT INTO song_artists (song_id, artist_id, is_main)
                    VALUES (?, ?, 1)
                    ON CONFLICT(song_id, artist_id) DO UPDATE SET is_main=1;
                """, (song_id, artist_id))

                # 5. Procesar e Vincular Géneros (maneja múltiples géneros por canción)
                for genre_name in genres:
                    if not genre_name:
                        continue
                    
                    cursor.execute("""
                        INSERT INTO genres (name) 
                        VALUES (?) 
                        ON CONFLICT(name) DO UPDATE SET name=name;
                    """, (genre_name,))
                    
                    cursor.execute("SELECT id FROM genres WHERE name = ?;", (genre_name,))
                    genre_id = cursor.fetchone()[0]

                    cursor.execute("""
                        INSERT INTO song_genres (song_id, genre_id)
                        VALUES (?, ?)
                        ON CONFLICT(song_id, genre_id) DO NOTHING;
                    """, (song_id, genre_id))

        print("¡Migración e importación completada exitosamente sin duplicados!")

    except sqlite3.Error as e:
        print(f"Ocurrió un error en la base de datos: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    import_songs_cache()
