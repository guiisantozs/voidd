import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTrailer,gameHeroImages,quickGameReview,gameImageSource,gameImageSet} from '../lib/game-hero.js';
const item={id:51325,categoria:'jogos',titulo:'Game',estreia:'2020-06-19'};
const now=new Date('2026-10-23T15:00:00Z');
test('quick game ratings preserve existing privacy, text and dates, including zero and half stars',()=>{
  const prior={nota:4,public:false,texto:'Minha avaliação',spoiler:true,data:'2025-01-01',favorito:true};
  const saved=quickGameReview(item,prior,3.5,true,now);
  assert.equal(saved.nota,3.5);assert.equal(saved.public,false);assert.equal(saved.texto,prior.texto);assert.equal(saved.data,prior.data);assert.equal(saved.spoiler,true);
  assert.equal(quickGameReview(item,null,0,true,now).nota,0);
  assert.equal(quickGameReview(item,null,4.7,true,now).nota,4.7);
  assert.equal(quickGameReview(item,null,5,true,now).public,true);
  assert.equal(quickGameReview(item,{...prior,public:true},5,false,now).public,false);
  assert.equal(prior.nota,4);
});
test('quick ratings reject unreleased games, missing dates and invalid scores',()=>{
  assert.throws(()=>quickGameReview({...item,estreia:'2099-01-01'},null,4,true,now));
  assert.throws(()=>quickGameReview({...item,estreia:null},null,4,true,now));
  for(const rating of ['',-1,6,4.75])assert.throws(()=>quickGameReview(item,null,rating,true,now));
});
test('trailer selection accepts only official HTTPS RAWG videos and missing trailers stay absent',()=>{
  assert.equal(gameTrailer([]),null);
  assert.equal(gameTrailer([{data:{480:'https://evil.test/video.mp4'}}]),null);
  assert.equal(gameTrailer([{data:{480:'javascript:alert(1)'}}]),null);
  assert.equal(gameTrailer([{name:'Trailer',data:{480:'https://media.rawg.io/media/video.mp4'}}]).url,'https://media.rawg.io/media/video.mp4');
  assert.deepEqual(gameHeroImages({backdrop:'/a.jpg',screenshots:['/a.jpg','/b.jpg']}),['/a.jpg','/b.jpg']);
});
test('hero resizes only official RAWG image paths and keeps other images intact',()=>{
  const source='https://media.rawg.io/media/screenshots/example.jpg';
  assert.equal(gameImageSource(source,640),'https://media.rawg.io/media/resize/640/-/screenshots/example.jpg');
  assert.equal(gameImageSource('/images/game.jpg',640),'/images/game.jpg');
  assert.equal(gameImageSource('https://example.com/media/games/a.jpg',640),'https://example.com/media/games/a.jpg');
  assert.ok(gameImageSet(source).includes('1920w'));
  assert.equal(gameImageSet(source),`${gameImageSource(source,640)} 640w, ${gameImageSource(source,1920)} 1920w`);
  for(const unsupported of [480,960,1440])assert.equal(gameImageSource(source,unsupported),source);
});
