// debug_insert.js
const f=require('fs');
const c=f.readFileSync('C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\App.jsx','utf8');
// Find the second occurrence of useEffect (the first one is in the import)
const idx=c.indexOf('useEffect(()');
console.log('First useEffect at:', idx);
const idx2=c.indexOf('useEffect(()', idx+10);
console.log('Second useEffect at:', idx2);
if(idx2>-1)console.log('Context:', JSON.stringify(c.substring(idx2-30, idx2+80)));
if(idx<0)console.log('No useEffect found!');
