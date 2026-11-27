import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import AnimeImage from '../components/animes/AnimeImage.js';
test('the ESM image adapter renders the real Next image component with optimization URLs',()=>{const html=renderToStaticMarkup(React.createElement(AnimeImage,{src:'/anime-poster.jpg',width:240,height:360,alt:'Pôster'}));assert.match(html,/<img/);assert.match(html,/_next\/image\?url=%2Fanime-poster.jpg/);assert.match(html,/alt="Pôster"/);});
