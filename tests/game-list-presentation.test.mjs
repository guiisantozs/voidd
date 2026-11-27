import test from 'node:test';
import assert from 'node:assert/strict';
import {gameListIdeas,gameIdeaThemes} from '../game-list-ideas.config.js';
import {listIdeas} from '../list-ideas.config.js';
import {gameListsSummary} from '../lib/game-list-presentation.js';

test('game inspirations cover all requested themes and contain only game metadata',()=>{
  assert.equal(gameListIdeas.length,30);
  assert.equal(new Set(gameListIdeas.map(idea=>idea.id)).size,30);
  assert.deepEqual([...new Set(gameListIdeas.map(idea=>idea.theme))],gameIdeaThemes.slice(1));
  for(const idea of gameListIdeas){
    assert.deepEqual(idea.media_types,['jogos']);
    assert.ok(idea.title.length<=80&&idea.description.length<=500);
    assert.doesNotMatch(`${idea.title} ${idea.description}`,/filmes?|séries?|\p{Extended_Pictographic}/iu);
    assert.deepEqual(Object.keys(idea).sort(),['description','id','media_types','theme','title']);
  }
  assert.equal(listIdeas.length,20);
  assert.equal(listIdeas.find(idea=>idea.id==='oitenta').description,'Filmes, séries e jogos lançados nos anos 80.');
});
test('HUD summarizes only supplied lists and does not invent game totals for mixed lists',()=>{
  const rows=[{item_count:8,media_types:['jogos'],collaboration_enabled:true},{item_count:3,media_types:['jogos']}];
  const wishlist={item_count:4,media_types:['jogos']};
  const before=JSON.stringify(rows);
  assert.deepEqual(gameListsSummary(rows,wishlist),{lists:3,games:15,shared:1});
  assert.deepEqual(gameListsSummary([...rows,{item_count:20,media_types:['filmes','jogos']}],wishlist),{lists:4,games:null,shared:1});
  assert.deepEqual(gameListsSummary(),{lists:0,games:0,shared:0});
  assert.equal(JSON.stringify(rows),before);
});
