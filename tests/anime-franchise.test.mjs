import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeFranchise} from '../lib/anime-franchise.js';
const id=n=>9000000000+n;
test('franchise traversal uses cached productions, sorts seasons, separates side stories, deduplicates cycles and preserves canonical IDs',async()=>{
 const rows=new Map([[id(1),{id:id(1),titulo:'Primeira',format:'TV',estreia:'2020-01-01',related:[{id:id(2),relation:'Sequel'},{id:id(3),relation:'Side story'}]}],[id(2),{id:id(2),titulo:'Segunda',format:'TV',estreia:'2026-01-01',related:[{id:id(1),relation:'Prequel'}]}],[id(3),{id:id(3),titulo:'Filme',format:'Movie',related:[]}]]);
 let calls=0;const saved=new Map(),cache={peek:async k=>k==='detail:v1:'+id(2)?rows.get(id(2)):null,get:async(k,load)=>{if(!saved.has(k))saved.set(k,await load());return saved.get(k);}};
 const graph=createAnimeFranchise({cache,detail:async key=>{calls++;return rows.get(key);}}),a=await graph(id(2));assert.deepEqual(a.seasons.map(x=>x.id),[id(1),id(2)]);assert.equal(a.seasons[1].current,true);assert.equal(a.seasons[1].seasonLabel,'Temporada 2');assert.deepEqual(a.specials.map(x=>x.id),[id(3)]);await graph(id(2));assert.equal(calls,2);
});
test('a cyclic large franchise never hydrates more than twelve productions',async()=>{let calls=0;const graph=createAnimeFranchise({cache:{peek:async()=>null,get:async(k,load)=>load()},detail:async key=>{calls++;return {id:key,format:'TV',related:[{id:key+1,relation:'Sequel'},{id:key-1,relation:'Prequel'}]};}});const result=await graph(id(100));assert.equal(calls,12);assert.equal(result.seasons.length,12);assert.equal(result.truncated,true);});
