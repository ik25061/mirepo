// replace_artist_section.js
const fs = require('fs');
const path = 'C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\components\\MobileHomeView.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldText = '            onPlay={() => {\r\n' +
  '              // Reproducir primera canción del artista\r\n' +
  '              const firstTrack = tracks.find(t => t.artist === artist.name);\r\n' +
  '              if (firstTrack) {\r\n' +
  '                const idx = tracks.indexOf(firstTrack);\r\n' +
  '                onPlay(firstTrack, idx);\r\n' +
  '              }\r\n' +
  '            }}\r\n' +
  '          />';

const newText = '            onClick={() => onSelectArtist && onSelectArtist(artist.name)}\r\n' +
  '          />';

const count = content.split(oldText).length - 1;
console.log('Occurrences found:', count);

if (count > 0) {
  content = content.replace(oldText, newText);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Replacement successful!');
} else {
  console.log('Text not found with CRLF!');
  // Try with LF
  const oldTextLF = oldText.replace(/\r\n/g, '\n');
  const countLF = content.split(oldTextLF).length - 1;
  console.log('Occurrences with LF:', countLF);
  if (countLF > 0) {
    content = content.replace(oldTextLF, newText.replace(/\r\n/g, '\n'));
    fs.writeFileSync(path, content, 'utf8');
    console.log('Replacement with LF successful!');
  } else {
    // Debug
    const idx = content.indexOf('onPlay');
    if (idx > -1) {
      console.log('Context around first onPlay:');
      console.log(JSON.stringify(content.substring(idx, idx + 250)));
    }
  }
}
