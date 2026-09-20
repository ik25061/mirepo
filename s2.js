// s2.js
const f=require('fs');
const p='C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\App.jsx';
let c=f.readFileSync(p,'utf8');
const R='\r\n';

// Insert handleSelectArtist and handleHideArtist before useEffect
const ins='};'+R+R+'  useEffect(() => {';
const rep='};'+R+
  '  // ===== SELECCIONAR ARTISTA ====='+R+
  '  const handleSelectArtist=useCallback((n)=>{setSelectedArtist(n)},[]);'+R+R+
  '  // ===== OCULTAR ARTISTA ====='+R+
  '  const handleHideArtist=useCallback((n)=>{setHiddenArtists(p=>new Set([...p,n]))},[]);'+R+R+
  '  useEffect(() => {';

if(c.includes(ins)){
  c=c.replace(ins,rep);
  f.writeFileSync(p,c,'utf8');
  console.log('Step 2 done');
}else{
  console.log('insert point not found');
}
