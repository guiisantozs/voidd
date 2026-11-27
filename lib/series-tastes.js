import {seriesAllowed} from './series-model.js';

export const SERIES_TASTE_RULES={choices:3,minVotes:50,minRating:6.5,candidateLimit:42,rowLimit:18};
export function seriesTasteIds(value){
 if(!Array.isArray(value)||value.length!==3||value.some(id=>!['string','number'].includes(typeof id)||!/^[1-9]\d{0,9}$/.test(String(id))))throw Error('INVALID_PREFERENCES');
 const ids=value.map(Number);if(new Set(ids).size!==3)throw Error('INVALID_PREFERENCES');return ids;
}
const stop=new Set('para como mais uma umas uns seu sua seus suas que dos das por com sem entre sobre quando depois antes pela pelo pelas pelos esta este esses essas seus suas eles elas isso onde muito também serie series história historias vida mundo the and for with from this that their they have been into about after before his her its who when are was were but you your um de da do os as em na no ao se eu a o e'.split(' '));
const clean=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const tokens=value=>new Set(clean(value).match(/[a-z]{3,}/g)?.filter(word=>!stop.has(word))||[]);
const keywordIds=item=>new Set((item.keywords||[]).map(k=>String(k.id)).filter(k=>/^\d+$/.test(k)));
const franchises=item=>new Set((item.keywords||[]).filter(k=>/universe|franchise|superhero|marvel|star wars|comic|spin.off/i.test(k.name||'')).map(k=>String(k.id)));
const overlap=(a,b)=>[...a].filter(value=>b.has(value)).length;
const titleKey=item=>clean(item.titulo).replace(/[^a-z0-9]/g,'');
export function rankTasteRecommendations(seeds,candidates,support=new Map(),{today=new Date().toISOString().slice(0,10),limit=SERIES_TASTE_RULES.rowLimit}={}){
 const excluded=new Set(seeds.map(s=>String(s.id))),titles=new Set(seeds.map(titleKey));
 const seedFeatures=seeds.map(s=>({genres:new Set(s.genreIds||[]),keywords:keywordIds(s),words:tokens(s.sinopse),franchises:franchises(s)}));
 const seen=new Set(),rows=candidates.filter(s=>seriesAllowed(s)&&s.posterPath&&!excluded.has(String(s.id))&&!titles.has(titleKey(s))&&s.estreia&&s.estreia<=today&&s.tmdbVoteCount>=SERIES_TASTE_RULES.minVotes&&s.tmdbRating>=SERIES_TASTE_RULES.minRating).filter(s=>{if(seen.has(String(s.id)))return false;seen.add(String(s.id));return true;});
 const frequency=new Map();for(const item of rows)for(const id of keywordIds(item))frequency.set(id,(frequency.get(id)||0)+1);
 const ranked=rows.map(item=>{
  const genre=new Set(item.genreIds||[]),keys=keywordIds(item),words=tokens(item.sinopse),universe=franchises(item);
  let genres=0,themes=0,plot=0,sharedUniverse=0;
  for(const seed of seedFeatures){genres+=overlap(genre,seed.genres)/Math.max(1,seed.genres.size);themes+=[...keys].filter(k=>seed.keywords.has(k)).reduce((score,k)=>score+Math.log(1+rows.length/(1+(frequency.get(k)||0))),0);plot+=overlap(words,seed.words)/Math.max(1,Math.min(seed.words.size,words.size));sharedUniverse+=overlap(universe,seed.franchises);}
  const sources=support.get(String(item.id))||[],related=new Set(sources.map(s=>s.seed)).size;
  const affinity=genres*1.2+Math.min(themes,12)*.65+plot*3+Math.min(sharedUniverse,3)*1.2+related*2+sources.reduce((n,s)=>n+(s.kind==='recommendations'?1:.5)/(1+s.rank/5),0);
  const quality=(item.tmdbRating/10)*.6+Math.min(Math.log1p(item.tmdbVoteCount)/10,1)*.35+Math.min(Math.log1p(item.popularity||0)/10,1)*.15;
  return {...item,tasteScore:affinity+quality,tasteAffinity:affinity,recommendationReason:sharedUniverse?'Universos e temas em comum':themes>0?'Temas em comum com suas escolhas':related?'Relacionada às suas séries favoritas':'Gêneros e histórias que combinam com você'};
 }).filter(item=>item.tasteAffinity>0).sort((a,b)=>b.tasteScore-a.tasteScore||b.tmdbVoteCount-a.tmdbVoteCount||a.id-b.id);
 const names=new Set();return ranked.filter(item=>{const key=titleKey(item);if(names.has(key))return false;names.add(key);return true;}).slice(0,limit);
}
