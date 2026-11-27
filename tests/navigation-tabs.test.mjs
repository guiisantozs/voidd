import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validTab,navigationLinkIndex} from '../lib/navigation-tabs.js';

test('route tabs validate direct links and ignore unknown or repeated query values',()=>{
 const keys=['overview','games','achievements'];
 assert.equal(validTab('games',keys,'overview'),'games');
 for(const value of [undefined,'private',['games','achievements']])assert.equal(validTab(value,keys,'overview'),'overview');
});
test('navigation prefers the exact section and stays active with a tab query',()=>{
 const links=['/jogos','/jogos#game-search-title','/jogos/colecao','/jogos/universos'];
 assert.equal(navigationLinkIndex(links,'https://void.test/jogos#game-search-title'),1);
 assert.equal(navigationLinkIndex(links,'https://void.test/jogos/colecao?aba=games'),2);
 assert.equal(navigationLinkIndex(links,'https://void.test/jogos/colecao/'),2);
 assert.equal(navigationLinkIndex(links,'https://void.test/jogos/universos'),3);
 assert.equal(navigationLinkIndex(links,'https://void.test/jogos/colecao/jogo'),-1);
});
test('section navigation excludes unrelated hashes and external destinations',()=>{
 const links=['#sobre','#filmes','https://elsewhere.test/universo#sobre'];
 assert.equal(navigationLinkIndex(links,'https://void.test/universo#filmes'),1);
 assert.equal(navigationLinkIndex(links,'https://void.test/universo#outra'),-1);
 assert.equal(navigationLinkIndex(['https://elsewhere.test/','mailto:a@b.test',null],'https://void.test/'),-1);
});
