import sqlite3, sys

DB = sys.argv[1] if len(sys.argv) > 1 else r'C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db'
c = sqlite3.connect(DB)
if len(sys.argv) > 2 and sys.argv[2] == '--tables':
    for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
        print(r[0])
elif len(sys.argv) > 2 and sys.argv[2] == '--cols':
    for t in sys.argv[3:]:
        print(f'--- {t} ---')
        for r in c.execute(f'PRAGMA table_info({t})'):
            print(r[1], r[2])
