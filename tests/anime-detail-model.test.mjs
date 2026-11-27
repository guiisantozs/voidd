import test from 'node:test';
import assert from 'node:assert/strict';
import {animeSeasonUnit} from '../lib/anime-detail-model.js';
test('a franchise season review preserves its own MAL production and existing season-one unit coordinates',()=>{const second={id:9000061967,titulo:'Segunda',estreia:'2026-10-03',numberOfEpisodes:12};assert.deepEqual(animeSeasonUnit(second),{seriesId:9000061967,seasonNumber:1,episodeNumber:0,name:'Segunda',airDate:'2026-10-03',poster:undefined,episodeCount:12,sourceDefined:true});});
