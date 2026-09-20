// replace_artistcard_prop.js
const fs = require('fs');
const path = 'C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\components\\MobileHomeView.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldText = 'function ArtistCard({ artist, onPlay }) {' + '\r\n' +
  '  return (' + '\r\n' +
  '    <div' + '\r\n' +
  '      className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"' + '\r\n' +
  '      style={{ width: 100 }}' + '\r\n' +
  '      onClick={onPlay}';

const newText = 'function ArtistCard({ artist, onClick }) {' + '\r\n' +
  '  return (' + '\r\n' +
  '    <div' + '\r\n' +
  '      className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"' + '\r\n' +
  '      style={{ width: 100 }}' + '\r\n' +
  '      onClick={onClick}';

const count = content.split(oldText).length - 1;
console.log('Occurrences:', count);
if (count > 0) {
  content = content.replace(oldText, newText);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Replaced ArtistCard prop!');
} else {
  console.log('Not found with CRLF');
  const oldTextLF = oldText.replace(/\r\n/g, '\n');
  const countLF = content.split(oldTextLF).length - 1;
  console.log('Occurrences with LF:', countLF);
  if (countLF > 0) {
    content = content.replace(oldTextLF, newText.replace(/\r\n/g, '\n'));
    fs.writeFileSync(path, content, 'utf8');
    console.log('Replaced with LF!');
  } else {
    const idx = content.indexOf('ArtistCard');
    console.log('Context:', JSON.stringify(content.substring(idx, idx + 200)));
  }
}
