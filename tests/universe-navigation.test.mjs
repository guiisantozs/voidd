import test from 'node:test';
import assert from 'node:assert/strict';
import {activeUniverseSection} from '../lib/universe-navigation.js';

test('section starts select the nested edition section without the long games parent overriding it',()=>{
  const positions=[{id:'inicio',top:-2100},{id:'sobre',top:-1100},{id:'jogos',top:-400},{id:'gu-remasters',top:96},{id:'midia',top:1800}];
  assert.equal(activeUniverseSection(positions,96),'gu-remasters');
  assert.equal(activeUniverseSection(positions.map(section=>({...section,top:section.top+8})),96),'jogos');
  assert.equal(activeUniverseSection(positions.map(section=>({...section,top:section.top-8})),96),'gu-remasters');
  assert.equal(activeUniverseSection([{id:'jogos',top:-1000},{id:'gu-remasters',top:-800,bottom:60},{id:'midia',top:900}],96),'jogos');
});

test('scrolling back, the hero and a short final section resolve deterministically',()=>{
  assert.equal(activeUniverseSection([{id:'inicio',top:-100},{id:'sobre',top:600}],96),'inicio');
  assert.equal(activeUniverseSection([{id:'sobre',top:-20},{id:'jogos',top:150}],96),'sobre');
  assert.equal(activeUniverseSection([{id:'midia',top:-500},{id:'outros-universos',top:300}],96,true),'outros-universos');
  assert.equal(activeUniverseSection([],96),null);
});
