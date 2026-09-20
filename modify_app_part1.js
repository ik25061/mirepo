// modify_app_part1.js
const fs = require('fs');
const path = 'C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\App.jsx';
let content = fs.readFileSync(path, 'utf8');
const CRLF = '\r\n';

const oldFetchBlock = 
  '  // ===== FETCH SONGS FROM SERVER =====' + CRLF +
  '  const fetchSongsFromServer = useCallback(async () => {' + CRLF +
  '    try {' + CRLF +
  '      setLoading(true);' + CRLF +
  '      const response = await fetch(`' + '${API_URL}/api/songs?limit=50000`);' + CRLF +
  '      if (!response.ok) throw new Error(\'Error fetching songs\');' + CRLF +
  '      const data = await response.json();' + CRLF +
  '      const tracksWithUrls = data.songs.map(serverToTrack);' + CRLF +
  '      setTracks(tracksWithUrls);' + CRLF +
  '    } catch (err) {' + CRLF +
  '      console.error(\'Error fetching songs:\', err);' + CRLF +
  '    } finally {' + CRLF +
  '      setLoading(false);' + CRLF +
  '    }' + CRLF +
  '  }, []);' + CRLF +
  '' + CRLF +
  '  // ===== REFRESH FROM SERVER (sin perder likes) =====' + CRLF +
  '  const handleRefresh = useCallback(async () => {' + CRLF +
  '    try {' + CRLF +
  '      setLoading(true);' + CRLF +
  '      // Primero sincronizar la base de datos en el servidor' + CRLF +
  '      await fetch(`' + '${API_URL}/api/sync-db`, { method: \'POST\' });' + CRLF +
  '      // Luego recargar las canciones' + CRLF +
  '      const response = await fetch(`' + '${API_URL}/api/songs?limit=50000`);' + CRLF +
  '      if (!response.ok) throw new Error(\'Error fetching songs\');' + CRLF +
  '      const data = await response.json();' + CRLF +
  '      const tracksWithUrls = data.songs.map(serverToTrack);' + CRLF +
  '      setTracks(tracksWithUrls);' + CRLF +
  '    } catch (err) {' + CRLF +
  '      console.error(\'Error refreshing songs:\', err);' + CRLF +
  '    } finally {' + CRLF +
  '      setLoading(false);' + CRLF +
  '    }' + CRLF +
  '  }, []);';

console.log('Contains old block:', content.includes(oldFetchBlock));

if (!content.includes(oldFetchBlock)) {
  const oldNoCR = oldFetchBlock.replace(/\r\n/g, '\n');
  console.log('Contains old block (LF):', content.includes(oldNoCR));
}
