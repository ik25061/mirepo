// modify_app_fetch.js
const fs = require('fs');
const path = 'C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\App.jsx';
let content = fs.readFileSync(path, 'utf8');
const CRLF = '\r\n';

// Step 1: Replace old fetch functions with progressive loading
const oldBlock = 
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
  '  }, []);' + CRLF;

console.log('Has old fetch:', content.includes(oldBlock));
