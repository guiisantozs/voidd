import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDetail, trailerFrom, getMovieDetail, clearDetailCache } from '../lib/movie-detail.js';
import { validReview,cleanReviewText,reviewMovie } from '../lib/review-detail.js';

test('film normalization preserves existing scale and resolves BR certification, complete credits and optional gallery',()=>{
  const movie=normalizeDetail({id:1,title:'Filme',vote_count:4,vote_average:8,runtime:120,release_date:'2020-01-01',release_dates:{results:[{iso_3166_1:'US',release_dates:[{certification:'R'}]},{iso_3166_1:'BR',release_dates:[{certification:'16'}]}]},credits:{cast:Array.from({length:25},(_,id)=>({id,name:`Pessoa ${id}`,profile_path:'/a.jpg'})),crew:[{name:'Diretora',job:'Director'},{name:'Autora',job:'Writer'}]},images:{backdrops:[{file_path:'/b.jpg'}]}});
  assert.equal(movie.nota,4);assert.equal(movie.classificacao,'16');assert.equal(movie.elenco.length,25);assert.equal(movie.creditos.length,8);assert.match(movie.galeria[0].thumb,/w300/);assert.ok(movie.informacoes.some(r=>r.label==='Roteiro'&&r.valor==='Autora'));
  assert.equal(normalizeDetail({id:2}).trailer,null);assert.deepEqual(normalizeDetail({id:2}).galeria,[]);
});
test('trailers accept only valid YouTube keys and supported video types',()=>{
  assert.equal(trailerFrom([{site:'YouTube',type:'Trailer',key:'javascript:alert(1)'}]),null);
  assert.equal(trailerFrom([{site:'Vimeo',type:'Trailer',key:'abcdefghijk'},{site:'YouTube',type:'Trailer',official:true,key:'123456789ab'}]),'123456789ab');
});
test('detail caching deduplicates calls, and optional trailer failure does not hide the film',async()=>{
  const fetchOriginal=globalThis.fetch,keyOriginal=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test';clearDetailCache();let calls=0;
  globalThis.fetch=async input=>{calls++;const url=new URL(input);assert.equal(url.searchParams.get('region'),'BR');if(url.pathname.endsWith('/videos'))throw Error('offline');return {ok:true,json:async()=>({id:12,title:'Sem trailer'})};};
  try{const [a,b]=await Promise.all([getMovieDetail('12'),getMovieDetail('12')]);assert.equal(a.titulo,'Sem trailer');assert.equal(b.trailer,null);assert.equal(calls,2);await getMovieDetail('12');assert.equal(calls,2);}finally{globalThis.fetch=fetchOriginal;if(keyOriginal===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=keyOriginal;clearDetailCache();}
});
test('review validation rejects overflow, invalid dates and future watches on the canonical 0..5 scale',()=>{
  const form={rating:4.2,text:'Bom filme',date:'2026-01-20'};const now=new Date('2026-10-20T12:00:00Z');assert.ok(validReview(form,now));
  for(const patch of [{rating:''},{rating:-0.1},{rating:5.1},{rating:4.25},{date:'2026-99-99'},{date:'2026-02-30'},{date:'2099-01-01'},{text:'a'.repeat(2001)}])assert.equal(validReview({...form,...patch},now),false);
  assert.equal(cleanReviewText('  a\u0000b  '),'ab');assert.equal(cleanReviewText('<script>alert(1)</script>'),'<script>alert(1)</script>'); // rendered only as escaped React text
  assert.deepEqual(reviewMovie({id:1,titulo:'A',elenco:[{nome:'Pessoa'}],equipe:[]}),{id:1,titulo:'A'});
});
