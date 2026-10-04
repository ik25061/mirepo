// Dump del DDL de tablas concretas para revisar las claves foráneas (cascade).
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db', { readOnly: true });
for (const t of ['song_features', 'comments', 'comment_likes', 'episode_progress', 'audio_metadata', 'song_moods', 'moods']) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(t);
  console.log('\n=== ' + t + ' ===');
  console.log(row ? row.sql : '(no existe)');
}
db.close();
