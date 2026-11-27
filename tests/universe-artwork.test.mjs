import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {gameUniverseLandings} from '../config/game-universe-landings.js';
import {marvelUniverse} from '../config/marvel-universe.js';
import {movieUniverseSrcSet} from '../lib/universe-backdrop.js';
import {movieUniverseLandings} from '../config/movie-universe-landings.js';

const root=path.resolve('public');
const manifest=JSON.parse(await readFile(new URL('../config/universe-artwork.json',import.meta.url),'utf8'));
test('every cinematic game universe retains original artwork and has valid responsive copies',async()=>{
  for(const landing of Object.values(gameUniverseLandings)){
    for(const source of [landing.hero,landing.about]){
      const asset=manifest[source];assert.ok(asset,source);
      const original=await sharp(path.join(root,source.slice(1))).metadata();
      assert.equal(asset.width,original.width);assert.equal(asset.height,original.height);
      assert.ok(asset.variants.length>=2);
      let previous=0;
      for(const variant of asset.variants){
        assert.ok(variant.width>previous&&variant.width<=asset.width);previous=variant.width;
        const file=path.join(root,variant.src.slice(1)),image=await sharp(file).metadata();
        assert.equal(image.width,variant.width);assert.equal(image.format,'webp');
        assert.equal((await stat(file)).size,variant.bytes);
        assert.ok(Math.abs(image.height/image.width-asset.height/asset.width)<.002);
        if(variant.src.startsWith('/universos/optimized/'))assert.match(variant.src,/universe-\d+-[a-f0-9]{12}-\d+\.webp$/);
      }
    }
  }
});
test('film landing artwork is covered and responsive TMDB URLs preserve the image identity',async()=>{
  for(const source of [marvelUniverse.hero,marvelUniverse.about,...Object.values(movieUniverseLandings).flatMap(landing=>[landing.hero,landing.about])]){
    assert.ok(manifest[source]);
    for(const variant of manifest[source].variants)assert.equal((await stat(path.join(root,variant.src.slice(1)))).size,variant.bytes);
  }
  assert.equal(movieUniverseSrcSet('https://image.tmdb.org/t/p/w1280/scene.jpg'),'https://image.tmdb.org/t/p/w780/scene.jpg 780w, https://image.tmdb.org/t/p/w1280/scene.jpg 1280w');
  assert.equal(movieUniverseSrcSet('/universos/local.jpg'),undefined);
  assert.equal(movieUniverseSrcSet('https://unrelated.example/t/p/w1280/scene.jpg'),undefined);
});

test('Harry Potter artwork preserves the supplied originals and serves smaller responsive copies',async()=>{
  const landing=movieUniverseLandings['harry-potter'];
  for(const source of [landing.hero,landing.about]){
    const asset=manifest[source],original=await sharp(path.join(root,source.slice(1))).metadata();
    assert.equal(asset.width,original.width);assert.equal(asset.height,original.height);
    assert.ok(asset.variants.length>=2);
    for(const variant of asset.variants){
      const image=await sharp(path.join(root,variant.src.slice(1))).metadata();
      assert.equal(image.width,variant.width);assert.equal(image.format,'webp');
      assert.ok(Math.abs(image.height/image.width-asset.height/asset.width)<.002);
    }
  }
  const hero=manifest[landing.hero],desktop=hero.variants.find(variant=>variant.width===1920);
  assert.ok(desktop.bytes<(await stat(path.join(root,landing.hero.slice(1)))).size*.1);
});
test('Zelda 1920px versions remove over 85% of transfer while preserving full-size source files',async()=>{
  let original=0,responsive=0;
  for(const source of [gameUniverseLandings['the-legend-of-zelda'].hero,gameUniverseLandings['the-legend-of-zelda'].about]){
    original+=(await stat(path.join(root,source.slice(1)))).size;
    responsive+=manifest[source].variants.find(variant=>variant.width===1920).bytes;
  }
  assert.ok(responsive<original*.15);
});
