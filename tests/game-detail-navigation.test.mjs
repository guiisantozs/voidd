import test from 'node:test';
import assert from 'node:assert/strict';
import { gameDetailTab, gameDetailTabs } from '../lib/game-detail-tabs.js';
import { keyArtCandidates, publicStorePoster, usableKeyArt } from '../lib/game-key-art.js';
import { rankSimilarGames, similarGameCandidates } from '../lib/game-similarity.js';

test('game tabs default to overview and keep old review/status/media links usable', () => {
  assert.equal(gameDetailTab(''), 'visao-geral'); assert.equal(gameDetailTab('#unknown'), 'visao-geral');
  assert.equal(gameDetailTab('#listas-status'), 'sua-jornada');
  assert.equal(gameDetailTab('#detalhes'), 'visao-geral');
  for (const [id] of gameDetailTabs) assert.equal(gameDetailTab('#'+id), id);
});

test('hero backgrounds prioritize landscape artwork, reject portrait covers and keep media fallbacks', () => {
  const store = publicStorePoster([{url:'https://store.steampowered.com.evil.test/app/367520/'},{url:'https://store.steampowered.com/app/367520/Hollow_Knight/'}]);
  assert.ok(store.url.endsWith('/367520/library_hero_2x.jpg'));
  assert.equal(publicStorePoster([{url:'https://store.steampowered.com/app/../anything'}]),null);
  const items = keyArtCandidates({storePoster:store,poster:'https://media.rawg.io/media/screenshots/scene.jpg',screenshots:[]},null);
  assert.equal(items.length,3);assert.equal(items[0].portrait,false);
  assert.equal(usableKeyArt({portrait:true},264,374),false);assert.equal(usableKeyArt({portrait:true},600,900),false);
  assert.equal(usableKeyArt({portrait:false},1280,720),false);assert.equal(usableKeyArt({portrait:false},1920,1080),true);
  assert.equal(keyArtCandidates({poster:'https://example.test/image.jpg'},null).length,0);
});

const seed = { id: 1, name: 'Hollow Knight', developers:[{id:10}], genres:[{id:51,slug:'indie'},{id:4,slug:'action'}], tags:[{id:200,slug:'metroidvania',name:'Metroidvania'}] };
const candidate = (id,name,extra={}) => ({id,name,background_image:'https://media.rawg.io/image.jpg',rating:4,ratings_count:10,...extra});
test('game similarity puts the sequel first, specific style next, and rejects generic indie matches and self duplicates', () => {
  const games=rankSimilarGames(seed,[
    {kind:'series',rows:[candidate(2,'Hollow Knight: Silksong'),candidate(1,'Hollow Knight')]},
    {kind:'style',rows:[candidate(3,'Another Metroidvania',{tags:seed.tags}),candidate(4,'Unrelated indie',{genres:[{id:51,slug:'indie'}]}),candidate(9,'Hollow Knight: Silksong DEMAKE',{tags:seed.tags})]},
    {kind:'developer',rows:[candidate(5,'Another studio game'),candidate(2,'Hollow Knight: Silksong')]},
  ]);
  assert.deepEqual(games.map(game=>game.id),[2,3,5]);
  assert.equal(games[0].similarityReason,'Mesma série');assert.match(games[1].similarityReason,/Metroidvania/);assert.equal(games[2].similarityReason,'Mesmo estúdio');
});

test('similar candidates fetch series, developer and metroidvania sources; partial outages preserve real matches', async () => {
  const urls=[];
  const data=await similarGameCandidates('1',{key:'fixture-secret',fetcher:async url=>{
    urls.push(url);if(url.pathname==='/api/games/1')return seed;
    if(url.pathname.endsWith('/game-series'))return {results:[candidate(2,'Hollow Knight: Silksong')]};
    if(url.searchParams.has('developers'))throw new Error('TEMPORARY');
    return {results:[candidate(3,'Another Metroidvania',{tags:seed.tags})]};
  }});
  assert.ok(urls.some(url=>url.searchParams.get('tags')==='metroidvania'));
  assert.ok(urls.some(url=>url.searchParams.get('developers')==='10'));
  assert.equal(data.games[0].id,2);assert.equal(data.partial,true);
  assert.equal(JSON.stringify(data).includes('fixture-secret'),false);
});
