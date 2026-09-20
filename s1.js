// s1.js
const f=require('fs');
const p='C:\\Users\\wolf\\OneDrive\\Documentos\\GitHub\\mirepo\\frontend\\src\\App.jsx';
let c=f.readFileSync(p,'utf8');
const R='\r\n';

// Find old fetch block
const fs1=c.indexOf('  // ===== FETCH SONGS FROM SERVER =====');
const fe1=c.indexOf('  }, []);',c.indexOf('fetchSongsFromServer'))+'  }, []);'.length;
const ob=c.substring(fs1,fe1);

const n1='  const PAGE_SIZE = 100;'+R+R+
  '  // ===== FETCH SONGS FROM SERVER (progresivo) ====='+R+
  '  const fetchSongsFromServer = useCallback(async () => {'+R+
  '    try {'+R+
  '      setLoading(true);'+R+
  '      setTracks([]);'+R+
  '      setAllTracksLoaded(false);'+R+
  '      const r=await fetch(`'+'${API_URL}/api/songs?limit='+'${PAGE_SIZE}&offset=0`);'+R+
  '      if(!r.ok)throw Error(\'Error\');'+R+
  '      const d=await r.json();'+R+
  '      const fb=d.songs.map(serverToTrack);'+R+
  '      setTracks(fb);setCurrentPage(0);setHasMore(d.hasMore);setLoading(false);'+R+
  '      if(d.hasMore){'+R+
  '        let at=[...fb];'+R+
  '        for(let pg=1;pg<=5;pg++){'+R+
  '          const r2=await fetch(`'+'${API_URL}/api/songs?limit='+'${PAGE_SIZE}&offset='+'${pg*PAGE_SIZE}`);'+R+
  '          if(!r2.ok)break;'+R+
  '          const pd=await r2.json();'+R+
  '          const bt=pd.songs.map(serverToTrack);'+R+
  '          at=[...at,...bt];setTracks([...at]);setCurrentPage(pg);'+R+
  '          setHasMore(pd.hasMore);'+R+
  '          if(!pd.hasMore){setAllTracksLoaded(true);break}'+R+
  '        }'+R+
  '      }else setAllTracksLoaded(true)'+R+
  '    }catch(err){console.error(err);setLoading(false)}'+R+
  '  },[]);'+R;

const n2=
  '  // ===== CARGAR MÁS (scroll infinito) ====='+R+
  '  const loadMoreSongs=useCallback(async()=>{'+
  'if(isLoadingMore||!hasMore)return;setIsLoadingMore(true);'+R+
  '    try{'+R+
  '      const np=currentPage+1;'+R+
  '      const r=await fetch(`'+'${API_URL}/api/songs?limit='+'${PAGE_SIZE}&offset='+'${np*PAGE_SIZE}`);'+R+
  '      if(!r.ok)throw Error(\'Error\');'+R+
  '      const d=await r.json();'+R+
  '      const bt=d.songs.map(serverToTrack);'+R+
  '      setTracks(prev=>{const e=new Set(prev.map(t=>t.id));return[...prev,...bt.filter(t=>!e.has(t.id))]});'+R+
  '      setCurrentPage(np);setHasMore(d.hasMore);'+R+
  '      if(!d.hasMore)setAllTracksLoaded(true)'+R+
  '    }catch(err){console.error(err)}finally{setIsLoadingMore(false)}'+R+
  '  },[isLoadingMore,hasMore,currentPage]);'+R;

c=c.substring(0,fs1)+n1+n2+c.substring(fe1);

// Replace old refresh
const rs=c.indexOf('  // ===== REFRESH FROM SERVER (sin perder likes) =====');
const re=c.indexOf('  }, []);'+R+R+'  useEffect',rs)+'  }, []);'.length;
const orb=c.substring(rs,re);

const n3='  // ===== REFRESH FROM SERVER ====='+R+
  '  const handleRefresh=useCallback(async()=>{'+
  'try{setLoading(true);'+R+
  '      await fetch(`'+'${API_URL}/api/sync-db`,{method:\'POST\'});'+R+
  '      setTracks([]);setAllTracksLoaded(false);'+R+
  '      const r=await fetch(`'+'${API_URL}/api/songs?limit='+'${PAGE_SIZE}&offset=0`);'+R+
  '      if(!r.ok)throw Error(\'Error\');'+R+
  '      const d=await r.json();'+R+
  '      const fb=d.songs.map(serverToTrack);'+R+
  '      setTracks(fb);setCurrentPage(0);setHasMore(d.hasMore);setLoading(false);'+R+
  '      if(d.hasMore){'+R+
  '        let at=[...fb];'+R+
  '        for(let pg=1;pg<=5;pg++){'+R+
  '          const r2=await fetch(`'+'${API_URL}/api/songs?limit='+'${PAGE_SIZE}&offset='+'${pg*PAGE_SIZE}`);'+R+
  '          if(!r2.ok)break;'+R+
  '          const pd=await r2.json();'+R+
  '          const bt=pd.songs.map(serverToTrack);'+R+
  '          at=[...at,...bt];setTracks([...at]);setCurrentPage(pg);'+R+
  '          setHasMore(pd.hasMore);'+R+
  '          if(!pd.hasMore){setAllTracksLoaded(true);break}'+R+
  '        }'+R+
  '      }else setAllTracksLoaded(true)'+R+
  '    }catch(err){console.error(err);setLoading(false)}'+R+
  '  },[]);'+R;

c=c.substring(0,rs)+n3+c.substring(re);

f.writeFileSync(p,c,'utf8');
console.log('Step 1 done');
