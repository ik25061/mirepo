import sqlite3
conn = sqlite3.connect('localfy.db')
cur = conn.cursor()

# Buscar álbumes duplicados por (name, main_artist_id)
cur.execute('SELECT name, main_artist_id, COUNT(*) as cnt FROM albums GROUP BY name, main_artist_id HAVING cnt > 1 ORDER BY name, main_artist_id')
rows = cur.fetchall()
print('=== Álbumes duplicados (name, main_artist_id) ===')
for r in rows:
    print(r)

cur.execute('SELECT COUNT(*) FROM albums')
total = cur.fetchone()[0]
print('Total albums:', total)

# Listar algunos álbumes con sus artistas para contexto
cur.execute('SELECT a.id, a.name, ar.name, a.main_artist_id FROM albums a LEFT JOIN artists ar ON a.main_artist_id = ar.id ORDER BY a.name, a.main_artist_id LIMIT 20')
albums = cur.fetchall()
print('\n=== Algunos álbumes con artista principal ===')
for a in albums:
    print(a)

conn.close()