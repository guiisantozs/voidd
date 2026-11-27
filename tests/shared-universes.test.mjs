import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedUniverseBySlug,seriesUniverseHref,universeMedia,universeMediaQuery} from '../lib/shared-universes.js';
import {filterUniverseMovies,franchiseProgress,orderFranchiseMovies} from '../lib/franchise-model.js';

test('series shortcuts use the same film landing for Marvel and Middle-earth while keeping the series entry context',()=>{
 assert.equal(seriesUniverseHref('marvel'),'/universos/marvel-mcu?media=series&from=series');
 assert.equal(seriesUniverseHref('senhor-dos-aneis'),'/universos/terra-media?media=series&from=series');
 assert.equal(seriesUniverseHref('game-of-thrones'),'/series/universos/game-of-thrones');
 assert.equal(seriesUniverseHref('diarios-de-um-vampiro'),'/series/universos/diarios-de-um-vampiro');
 assert.equal(sharedUniverseBySlug('terra-media').seriesSlug,'senhor-dos-aneis');assert.equal(sharedUniverseBySlug('jurassic'),undefined);
});
test('direct film visits default to films; media changes preserve the universe and origin and reject malformed values',()=>{
 for(const value of [undefined,'wrong',['series'],''])assert.equal(universeMedia(value),'filmes');
 assert.equal(universeMedia('series'),'series');assert.equal(universeMedia('all'),'all');
 const before={slug:'terra-media',media:'series',from:'series'};
 assert.deepEqual(universeMediaQuery(before,'all'),{...before,media:'all'});
 assert.deepEqual(universeMediaQuery(before,'filmes'),{slug:'terra-media',from:'series'});
 assert.equal(before.media,'series');
});
test('both media retain their own identities, chronology and private zero ratings when numeric IDs collide',()=>{
 const reviews={'filmes:1':{nota:5},'series:2':{nota:0,public:false},'series:1:1:1':{nota:5}};
 const items=[{id:1,categoria:'series',estreia:'2022-01-01'},{id:2,categoria:'series',estreia:'2020-01-01'}];
 assert.equal(franchiseProgress([1,2],reviews,'series'),1);assert.equal(franchiseProgress([1,2],reviews,'filmes'),1);
 const ordered=orderFranchiseMovies(items,[1,2],'chronological');
 assert.deepEqual(filterUniverseMovies(ordered,reviews,'seen','order','series').map(row=>row.id),[2]);
 assert.deepEqual(filterUniverseMovies(ordered,reviews,'seen','order','filmes').map(row=>row.id),[1]);
 assert.equal(items[0].id,1);
});
