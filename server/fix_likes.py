# fix_likes.py
import json
import sqlite3

DB_PATH = "localfy.db"

def fix_likes():
    with open('prefs.json', 'r', encoding='utf-8') as f:
        prefs_data = json.load(f)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    liked_count = 0
    
    for user_id_str, user_prefs in prefs_data.items():
        user_id = int(user_id_str)
        print(f"Procesando usuario: {user_id}")
        
        songs_prefs = user_prefs.get('songs', {})
        print(f"  {len(songs_prefs)} preferencias de canciones")
        
        for song_id, prefs in songs_prefs.items():
            if prefs.get('liked') is True:
                cursor.execute('SELECT 1 FROM songs WHERE id = ?', (song_id,))
                if cursor.fetchone():
                    cursor.execute('''
                        INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type)
                        VALUES (?, ?, 'LIKE')
                    ''', (user_id, song_id))
                    liked_count += 1
                    print(f"  ✅ LIKE: {song_id}")
                else:
                    print(f"  ⚠️ Canción no encontrada: {song_id}")
    
    conn.commit()
    conn.close()
    print(f"\n✅ Total likes insertados: {liked_count}")

if __name__ == "__main__":
    fix_likes()