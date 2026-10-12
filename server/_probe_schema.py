import sqlite3

c = sqlite3.connect(r"server/localfy.db")
rows = c.execute(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name LIKE '%mood%'"
).fetchall()
print("mood tables:", [r[0] for r in rows])
for r in c.execute("SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') AND name IN ('moods','song_moods','song_moods_meta','song_moods_auto')"):
    print("===", r[0], "===")
    print(r[1])
