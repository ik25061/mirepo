import { getAlbumsWithPagination, getArtistsWithPagination, getGenresWithPagination, closeDb } from './db.js';

console.log('inicio');

const t0 = Date.now();
const albums = await getAlbumsWithPagination({ search: 'pájaros', limit: 5, offset: 0 });
console.log(`[albums] search=pájaros total=${albums.pagination.total} (${Date.now() - t0}ms)`);
for (const a of albums.items) console.log('  -', a.name, '|', a.artist, '| songs=', a.song_count, '| coverId=', a.coverId);

const t1 = Date.now();
const albums2 = await getAlbumsWithPagination({ search: 'PAJAROS', limit: 5, offset: 0 });
console.log(`[albums] search=PAJAROS total=${albums2.pagination.total} (${Date.now() - t1}ms)`);
console.log('  · mismos resultados?', albums2.pagination.total === albums.pagination.total);

const t2 = Date.now();
const genres = await getGenresWithPagination({ search: 'latino', limit: 5, offset: 0 });
console.log(`[generos]='latino' total=${genres.pagination.total} (${Date.now() - t2}ms)`);
for (const g of genres.items) console.log('  -', g.name);

const t3 = Date.now();
const genres2 = await getGenresWithPagination({ search: 'LATINO', limit: 5, offset: 0 });
console.log(`[generos]='LATINO' total=${genres2.pagination.total} igual=${genres2.pagination.total === genres.pagination.total} (${Date.now() - t3}ms)`);

await closeDb();
console.log('FIN');