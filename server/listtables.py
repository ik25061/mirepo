import sqlite3, sys
conn = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else 'localfy.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)
# Mostrar esquema de cada tabla
for t in tables:
    cur.execute(f"SELECT sql FROM sqlite_master WHERE name='{t}'")
    row = cur.fetchone()
    print(f'\nSchema for {t}:')
    print(row[0] if row else 'N/A')
conn.close()