import test from 'node:test';
import assert from 'node:assert/strict';
import {dcUniverse} from '../config/dc-universe.js';
import {dcShelves} from '../lib/dc-universe.js';

const movie=(id,titulo,estreia,genreIds=[])=>({id,titulo,estreia,genreIds,categoria:'filmes'});
test('current DCU excludes DCEU, Elseworlds and animated namesakes',()=>{
 const input=[movie(1061474,'Superman','2025-07-09'),movie(1081003,'Supergirl','2026-06-24'),movie(1400940,'Cara-de-Barro','2026-10-19'),movie(1523140,'O Homem do Amanhã','2027-07-07'),movie(1081004,'The Brave and the Bold',null),movie(49521,'O Homem de Aço','2013-06-12'),movie(414906,'Batman','2022-03-01'),movie(618354,'Superman: O Homem do Amanhã','2020-08-23',[16])];
 const rows=dcShelves(input,{today:'2026-10-29'});
 assert.deepEqual(rows.dcu.map(m=>m.id),[1061474,1081003,1400940,1523140,1081004]);
 assert(!dcUniverse.dcu.includes(49521));assert(!dcUniverse.dcu.includes(618354));
});
test('recent shelf keeps released newest first, then future dates and undated films',()=>{
 const films=[movie(1,'Anterior','2025-01-01'),movie(2,'Hoje','2026-10-29'),movie(3,'Futuro','2027-01-01'),movie(4,'Sem data',null)];
 assert.deepEqual(dcShelves(films,{today:'2026-10-29'}).recent.map(m=>m.id),[2,1,3,4]);
 assert.deepEqual(dcShelves(films).recent.map(m=>m.id),[1,2,3,4]);
});
test('animation combines every available animated film, deduplicated and without mutating the catalogue',()=>{
 const films=[movie(1,'Batman: Teste','2000-01-01',[16]),movie(2,'Liga da Justiça','2001-01-01',[16,28]),movie(3,'Superman','2002-01-01',[28]),movie(4,'Animação no título não é gênero','2003-01-01',[]),movie(1,'Batman: Teste','2000-01-01',[16])];
 const before=JSON.stringify(films),rows=dcShelves(films,{today:'2026-10-29'});
 assert.deepEqual(rows.animation.map(m=>m.id),[1,2]);assert.equal(JSON.stringify(films),before);
 assert.equal(rows.recent.length,4);
});
test('character shelves include translated titles, ensemble films and animation without confusing a villain-only movie',()=>{
 const films=[movie(49521,'O Homem de Aço','2013-01-01'),movie(141052,'Liga da Justiça','2017-01-01'),movie(40662,'Batman Contra o Capuz Vermelho','2010-01-01',[16]),movie(1523140,'O Homem do Amanhã','2027-01-01'),movie(475557,'Coringa','2019-01-01'),movie(1081004,'The Brave and the Bold',null)];
 const rows=dcShelves(films);
 assert.deepEqual(rows.batman.map(m=>m.id),[40662,141052,1081004]);
 assert.deepEqual(rows.superman.map(m=>m.id),[49521,141052,1523140]);
});
test('all shelves respect valid owner reviews including zero and retain real empty states',()=>{
 const films=[movie(1061474,'Superman','2025-07-09'),movie(40662,'Batman Contra o Capuz Vermelho','2010-01-01',[16])],reviews={'filmes:1061474':{nota:0},'filmes:40662':{nota:'4'}};
 const seen=dcShelves(films,{today:'2026-10-29',filter:'seen',reviews});
 assert.deepEqual(seen.dcu.map(m=>m.id),[1061474]);assert.deepEqual(seen.batman,[]);
 assert.deepEqual(dcShelves(films,{filter:'unseen',reviews}).animation.map(m=>m.id),[40662]);
 for(const rows of Object.values(dcShelves([])))assert.deepEqual(rows,[]);
});
