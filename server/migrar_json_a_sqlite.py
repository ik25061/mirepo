#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
MIGRAR JSON A SQLITE - localfy.db (VERSIÓN COMPLETA)
============================================================
"""

import json
import sqlite3
import os
import re
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'localfy.db')

def load_json(file_path):
    if not os.path.exists(file_path):
        print(f"⚠️ Archivo no encontrado: {file_path}")
        return {}
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error cargando {file_path}: {e}")
        return {}

def get_or_create_artist(cursor, name):
    if not name or name == 'Artista desconocido':
        return None
    cursor.execute('SELECT id FROM artists WHERE name = ?', (name,))
    row = cursor.fetchone()
    if row:
        return row[0]
    cursor.execute('INSERT INTO artists (name) VALUES (?)', (name,))
    return cursor.lastrowid

def get_or_create_album(cursor, name, main_artist_id, year):
    if not name or name == 'Álbum desconocido':
        return None
    cursor.execute('SELECT id FROM albums WHERE name = ? AND main_artist_id = ?', (name, main_artist_id))
    row = cursor.fetchone()
    if row:
        return row[0]
    cursor.execute('INSERT INTO albums (name, main_artist_id, year) VALUES (?, ?, ?)',
                   (name, main_artist_id, year))
    return cursor.lastrowid

def get_or_create_genre(cursor, name):
    if not name or name == 'Sin género':
        return None
    cursor.execute('SELECT id FROM genres WHERE name = ?', (name,))
    row = cursor.fetchone()
    if row:
        return row[0]
    cursor.execute('INSERT INTO genres (name) VALUES (?)', (name,))
    return cursor.lastrowid

def extract_artist_and_feat(artist_string):
    if not artist_string:
        return None, []
    
    artist_string = str(artist_string).strip()
    if not artist_string or artist_string == 'Artista desconocido':
        return None, []
    
    patterns = [
        r'\s*\(feat\.?[^)]*\)',
        r'\s*\(ft\.?[^)]*\)',
        r'\s*\(featuring[^)]*\)',
        r'\s*feat\.?\s+(.+)',
        r'\s*ft\.?\s+(.+)',
        r'\s*featuring\s+(.+)',
        r'\s*&\s+(.+)',
        r'\s*con\s+(.+)',
        r'\s*vs\.?\s+(.+)',
        r'\s*,\s*(.+)',
        r'\s*;\s*(.+)',
    ]
    
    main_artist = artist_string
    collaborators = []
    
    for pattern in patterns:
        match = re.search(pattern, artist_string, re.IGNORECASE)
        if match:
            main_artist = artist_string[:match.start()].strip()
            collab_text = match.group(1).strip() if match.groups() else match.group(0).strip()
            collab_text = re.sub(r'[()]', '', collab_text)
            for c in collab_text.split(','):
                c = c.strip()
                if c and c not in collaborators:
                    collaborators.append(c)
            break
    
    if not collaborators and '&' in artist_string:
        parts = artist_string.split('&')
        main_artist = parts[0].strip()
        for p in parts[1:]:
            p = p.strip()
            if p:
                collaborators.append(p)
    
    if not main_artist or main_artist == 'Artista desconocido':
        main_artist = None
    
    return main_artist, collaborators

def migrate_all():
    print("🚀 Iniciando migración a SQLite...")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # ============================================================
    # 1. MIGRAR CANCIONES DESDE songs_cache.json
    # ============================================================
    print("🎵 Migrando canciones...")
    songs_data = load_json('songs_cache.json')
    songs_list = songs_data.get('songs', [])
    print(f"   {len(songs_list)} canciones encontradas")

    stats = {'songs': 0, 'artists': 0, 'albums': 0, 'genres': 0}
    artist_cache = {}

    try:
        with conn:
            for song in songs_list:
                # Extraer artista principal y colaboradores
                main_artist_name, collaborators = extract_artist_and_feat(song.get('artist'))
                
                # Obtener o crear artista principal
                main_artist_id = None
                if main_artist_name:
                    main_artist_id = get_or_create_artist(cursor, main_artist_name)
                    if main_artist_id:
                        stats['artists'] += 1

                # Obtener o crear álbum
                album_name = song.get('album', 'Álbum desconocido')
                album_year = song.get('year')
                album_id = get_or_create_album(cursor, album_name, main_artist_id, album_year)
                if album_id:
                    stats['albums'] += 1

                # Insertar canción
                cursor.execute('''
                    INSERT OR REPLACE INTO songs
                    (id, title, relPath, duration, track, hasLyrics, album_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    song['id'],
                    song['title'],
                    song['relPath'],
                    song.get('duration'),
                    song.get('track'),
                    1 if song.get('hasLyrics') else 0,
                    album_id
                ))
                stats['songs'] += 1

                # Insertar relación canción-artista principal
                if main_artist_id:
                    cursor.execute('''
                        INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main)
                        VALUES (?, ?, 1)
                    ''', (song['id'], main_artist_id))

                # Insertar colaboradores
                for collab_name in collaborators:
                    if collab_name:
                        collab_id = get_or_create_artist(cursor, collab_name)
                        if collab_id:
                            stats['artists'] += 1
                            cursor.execute('''
                                INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main)
                                VALUES (?, ?, 0)
                            ''', (song['id'], collab_id))

                # Insertar géneros y relaciones
                genres = song.get('genre', [])
                if isinstance(genres, str):
                    genres = [genres] if genres else []
                for genre_name in genres:
                    if genre_name and genre_name != 'Sin género':
                        genre_id = get_or_create_genre(cursor, genre_name)
                        if genre_id:
                            stats['genres'] += 1
                            cursor.execute('''
                                INSERT OR IGNORE INTO song_genres (song_id, genre_id)
                                VALUES (?, ?)
                            ''', (song['id'], genre_id))

    except sqlite3.Error as e:
        print(f"❌ Error en migración de canciones: {e}")
        return

    print(f"   ✅ {stats['songs']} canciones migradas")
    print(f"   ✅ {stats['artists']} artistas migrados")
    print(f"   ✅ {stats['albums']} álbumes migrados")
    print(f"   ✅ {stats['genres']} géneros migrados")

    # ============================================================
    # 2. MIGRAR LETRAS
    # ============================================================
    print("📝 Migrando letras...")
    lyrics_data = load_json('lyrics_cache.json')
    lyrics_count = 0
    for song_id, entry in lyrics_data.items():
        lyrics_text = entry.get('lyrics')
        synced_text = entry.get('syncedLines')
        translated_text = entry.get('translatedLyrics')

        if lyrics_text:
            if isinstance(synced_text, list):
                synced_text = '\n'.join([f"[{line['time']}] {line['text']}" for line in synced_text])
            
            cursor.execute('''
                INSERT OR REPLACE INTO lyrics
                (song_id, text, synced_text, translated_text)
                VALUES (?, ?, ?, ?)
            ''', (song_id, lyrics_text, synced_text, translated_text))
            lyrics_count += 1

    conn.commit()
    print(f"   ✅ {lyrics_count} letras migradas")

    # ============================================================
    # 3. MIGRAR USUARIOS
    # ============================================================
    print("👤 Migrando usuarios...")
    users_data = load_json('users.json')
    for user in users_data.get('users', []):
        cursor.execute('''
            INSERT OR REPLACE INTO users
            (id, username, salt, password_hash, session_token, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            user['id'],
            user['username'],
            user['salt'],
            user['password_hash'],
            user.get('session_token'),
            user.get('created_at', datetime.now().isoformat())
        ))

    conn.commit()
    print(f"   ✅ {len(users_data.get('users', []))} usuarios migrados")

    # ============================================================
    # 4. MIGRAR PREFERENCIAS
    # ============================================================
       # ============================================================
    # 4. MIGRAR PREFERENCIAS (CORREGIDO)
    # ============================================================
    print("⭐ Migrando preferencias...")
    prefs_data = load_json('prefs.json')
    
    liked_count = 0
    hidden_count = 0
    fav_artists_count = 0
    hidden_artists_count = 0

    for user_id_str, user_prefs in prefs_data.items():
        user_id = int(user_id_str)
        print(f"   Procesando usuario ID: {user_id}")

        # ============================================================
        # CANCIONES: liked y hidden
        # ============================================================
        songs_prefs = user_prefs.get('songs', {})
        print(f"      {len(songs_prefs)} preferencias de canciones encontradas")
        
        for song_id, prefs in songs_prefs.items():
            # Verificar que la canción existe en la base de datos
            cursor.execute('SELECT 1 FROM songs WHERE id = ?', (song_id,))
            if not cursor.fetchone():
                print(f"      ⚠️ Canción no encontrada: {song_id}")
                continue

            # LIKE
            if prefs.get('liked') is True:
                cursor.execute('''
                    INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type)
                    VALUES (?, ?, 'LIKE')
                ''', (user_id, song_id))
                liked_count += 1
                print(f"      ✅ LIKE: {song_id}")

            # HIDE (hidden o deleted)
            if prefs.get('hidden') is True or prefs.get('deleted') is True:
                cursor.execute('''
                    INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type)
                    VALUES (?, ?, 'HIDE')
                ''', (user_id, song_id))
                hidden_count += 1
                print(f"      🚫 HIDE: {song_id}")

        # ============================================================
        # ARTISTAS OCULTOS (artists: true)
        # ============================================================
        artists_prefs = user_prefs.get('artists', {})
        for artist_name, is_hidden in artists_prefs.items():
            if is_hidden is True:
                cursor.execute('SELECT id FROM artists WHERE name = ?', (artist_name,))
                row = cursor.fetchone()
                if row:
                    cursor.execute('''
                        INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type)
                        VALUES (?, ?, 'HIDE')
                    ''', (user_id, row[0]))
                    hidden_artists_count += 1
                    print(f"      🚫 Artista oculto: {artist_name}")

        # ============================================================
        # ARTISTAS FAVORITOS (favoriteArtists)
        # ============================================================
        fav_artists_list = user_prefs.get('favoriteArtists', [])
        for artist_name in fav_artists_list:
            cursor.execute('SELECT id FROM artists WHERE name = ?', (artist_name,))
            row = cursor.fetchone()
            if row:
                cursor.execute('''
                    INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type)
                    VALUES (?, ?, 'FAVORITE')
                ''', (user_id, row[0]))
                fav_artists_count += 1
                print(f"      ⭐ Artista favorito: {artist_name}")

    conn.commit()
    print(f"   ✅ {liked_count} canciones favoritas migradas")
    print(f"   ✅ {hidden_count} canciones ocultas migradas")
    print(f"   ✅ {fav_artists_count} artistas favoritos migrados")
    print(f"   ✅ {hidden_artists_count} artistas ocultos migrados")

    # ============================================================
    # 5. MIGRAR PLAYLISTS
    # ============================================================
    print("📋 Migrando playlists...")
    playlists_data = load_json('playlists.json')
    
    playlists_count = 0
    playlist_songs_count = 0

    for playlist in playlists_data.get('playlists', []):
        cursor.execute('''
            INSERT OR REPLACE INTO playlists
            (id, name, description, user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            playlist['id'],
            playlist['name'],
            playlist.get('description', ''),
            playlist.get('userId'),
            playlist.get('created_at', datetime.now().isoformat()),
            playlist.get('updated_at', datetime.now().isoformat())
        ))
        playlists_count += 1

        for idx, song_id in enumerate(playlist.get('songIds', [])):
            cursor.execute('''
                INSERT OR IGNORE INTO playlist_songs
                (playlist_id, song_id, position)
                VALUES (?, ?, ?)
            ''', (playlist['id'], song_id, idx))
            playlist_songs_count += 1

    conn.commit()
    print(f"   ✅ {playlists_count} playlists migradas")
    print(f"   ✅ {playlist_songs_count} canciones en playlists migradas")

    # ============================================================
    # 6. RESUMEN FINAL
    # ============================================================
    conn.close()
    print("\n" + "=" * 60)
    print("✅ MIGRACIÓN COMPLETADA EXITOSAMENTE")
    print("=" * 60)
    print(f"📁 Base de datos: {DB_PATH}")

if __name__ == '__main__':
    migrate_all()