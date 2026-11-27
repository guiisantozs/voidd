import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoogleBrazilRss,parseNetflixBrazilStream,attachBrazilEvidence,createAnimeRegionalSource,GOOGLE_BR_RSS,NETFLIX_COUNTRIES_TSV,parseBrazilAnimeNews,BRAZIL_ANIME_FEEDS} from '../lib/anime-regional-source.js';
const now=new Date('2026-11-04T16:00:00Z');
const header='country_name\tcountry_iso2\tweek\tcategory\tweekly_rank\tshow_title\tseason_title\n';
const tsv=header+'Brazil\tBR\t2026-11-01\tTV\t2\tOne Piece\tOne Piece: Season 1\n'+'Japan\tJP\t2026-11-01\tTV\t1\tOther\tOther: Season 1\n'+'Brazil\tBR\t2025-01-01\tTV\t1\tOld\tOld: Season 1\n';
const rss=title=>'<?xml version="1.0"?><rss><channel><item><title>'+title+'</title><pubDate>Wed, 4 Nov 2026 06:00:00 -0800</pubDate></item></channel></rss>';
test('official RSS parser validates dates, entities and country provenance without treating traffic as viewers',()=>{
 const rows=parseGoogleBrazilRss(rss('One Piece'),now);assert.equal(rows.length,1);assert.equal(rows[0].country,'BR');assert.equal(rows[0].url,GOOGLE_BR_RSS);assert.equal(rows[0].viewers,undefined);
 assert.equal(parseGoogleBrazilRss(rss('One Piece').replace('2026','2027'),now).length,0);
 assert.equal(parseGoogleBrazilRss(rss('One &amp; Piece'),now)[0].title,'One & Piece');
 assert.throws(()=>parseGoogleBrazilRss('<!DOCTYPE evil><rss/>',now));assert.throws(()=>parseGoogleBrazilRss('bad',now));
});
test('Netflix streaming export retains only validated Brazilian recent ranks, including chunk boundaries',async()=>{
 const bytes=new TextEncoder().encode(tsv),body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});
 const rows=await parseNetflixBrazilStream(body,now);assert.equal(rows.length,1);assert.equal(rows[0].rank,2);assert.equal(rows[0].title,'One Piece');assert.equal(rows[0].date,'2026-11-01');
 await assert.rejects(parseNetflixBrazilStream(new Response('wrong\theader\n').body,now),/HEADER/);
});
test('regional titles match whole unique aliases; one title never transfers a rank to another season',()=>{
 const original={id:1,titulo:'One Piece',format:'TV'},sequel={id:2,titulo:'One Piece Season 2',format:'TV',trendSignals:{relations:[{relation:'PREQUEL',artwork:original}]}};
 const evidence={source:'Netflix Top 10',country:'BR',title:'One Piece',seasonTitle:'One Piece: Season 2',date:'2026-11-01',rank:1,category:'TV'};
 const [a,b]=attachBrazilEvidence([original,sequel],{entries:[evidence]});assert.equal(a.regionalEvidence.length,0);assert.equal(a.regionalHints.length,1);assert.equal(b.regionalEvidence.length,1);assert.equal(b.regionalEvidence[0].association,'exact-season-title');
 const [ambiguous]=attachBrazilEvidence([original,{...original,id:3}],{entries:[{source:'Google Trends RSS',country:'BR',title:'One Piece',date:now.toISOString()}]});assert.equal(ambiguous.regionalEvidence.length,0);
 const [wrong]=attachBrazilEvidence([original],{entries:[{source:'Google Trends RSS',title:'One Piece of cake',date:now.toISOString()}]});assert.equal(wrong.regionalEvidence.length,0);
});
test('regional lookup supports supplied multilingual aliases, not a pinned anime selection',()=>{
 const [result]=attachBrazilEvidence([{id:1,titulo:'Shingeki no Kyojin',alternativeTitles:['Ataque dos Titãs']}],{entries:[{source:'Google Trends RSS',country:'BR',title:'ataque dos titas',date:now.toISOString()}]});assert.equal(result.regionalEvidence.length,1);
});
test('published Brazilian news keeps article provenance, matches the specific season and never declares a trailer a release',()=>{
 const xml=rss('Black Clover 2a temporada ganha trailer').replace('</pubDate>','</pubDate><link>https://www.jbox.com.br/2026/11/black-clover/</link>');
 const entries=parseBrazilAnimeNews(xml,BRAZIL_ANIME_FEEDS[0],now);assert.equal(entries.length,1);assert.equal(entries[0].eventKind,'announcement');
 const parent={id:1,titulo:'Black Clover'},child={id:2,titulo:'Black Clover 2nd Season',trendSignals:{relations:[{relation:'PREQUEL',artwork:parent}]}};
 const [result]=attachBrazilEvidence([child],{entries});assert.equal(result.regionalEvidence.length,1);assert.equal(result.regionalEvidence[0].association,'explicit-prequel-and-matching-season-number');
 const wrong=parseBrazilAnimeNews(xml.replace('www.jbox.com.br/2026','evil.invalid/2026'),BRAZIL_ANIME_FEEDS[0],now);assert.equal(wrong.length,0);
 const [other]=attachBrazilEvidence([{...child,titulo:'Black Clover 3rd Season'}],{entries});assert.equal(other.regionalEvidence.length,0);
});
test('Netflix exporter cancels after observing the recent Brazil block and its older boundary',async()=>{
 let canceled=false,step=0;const recent=header+'Brazil\tBR\t2026-11-01\tTV\t1\tAnime\tAnime: Season 1\nBrazil\tBR\t2026-10-25\tTV\t1\tAnime\tAnime: Season 1\nBrazil\tBR\t2026-01-01\tTV\t1\tOld\tOld: Season 1\n';
 const body=new ReadableStream({pull(controller){if(step++===0)controller.enqueue(new TextEncoder().encode(recent));else controller.enqueue(new TextEncoder().encode('unused history\n'));},cancel(){canceled=true;}});
 const rows=await parseNetflixBrazilStream(body,now,{stopAtBrazilHistory:true});assert.equal(rows.length,2);assert.equal(canceled,true);
});
test('one regional snapshot deduplicates requests and remains cached for six hours',async()=>{
 let calls=0,at=now;const source=createAnimeRegionalSource({clock:()=>at,fetcher:async url=>{calls++;return new Response(url===GOOGLE_BR_RSS?rss('One Piece'):tsv);}});
 const [a,b]=await Promise.all([source(),source()]);assert.equal(calls,4);assert.equal(a.entries.length,2);a.entries.pop();assert.equal(b.entries.length,2);await source();assert.equal(calls,4);at=new Date(now.getTime()+6*3600000+1);await source();assert.equal(calls,8);
});
test('source failure exposes unavailable status without inventing a Brazilian signal; last good retains original dates',async()=>{
 let fail=false,at=now,calls=0;const source=createAnimeRegionalSource({clock:()=>at,fetcher:async url=>{calls++;if(fail)throw Error('offline');return new Response(url===GOOGLE_BR_RSS?rss('One Piece'):tsv);}});
 const first=await source();fail=true;at=new Date(now.getTime()+6*3600000+1);const stale=await source();assert.equal(stale.stale,true);assert.equal(stale.entries[0].date,first.entries[0].date);assert.ok(stale.sources.every(row=>row.status==='unavailable'));await source();assert.equal(calls,8);
 const empty=await createAnimeRegionalSource({clock:()=>now,fetcher:async()=>{throw Error('offline');}})();assert.equal(empty.entries.length,0);assert.equal(empty.unavailable,true);
});
test('failure of Netflix alone preserves its dated evidence without pretending other available feeds cover its ranking',async()=>{
 let at=now,fail=false;const source=createAnimeRegionalSource({clock:()=>at,fetcher:async url=>{if(url===NETFLIX_COUNTRIES_TSV&&fail)throw Error('offline');return new Response(url===NETFLIX_COUNTRIES_TSV?tsv:rss('One Piece'));}});
 await source();at=new Date(now.getTime()+6*3600000+1);fail=true;
 const d=await source(),entries=d.entries.filter(row=>row.source==='Netflix Top 10');assert.equal(entries.length,1);assert.equal(entries[0].stale,true);assert.equal(entries[0].date,'2026-11-01');assert.equal(d.sources.find(row=>row.name==='Netflix Top 10').status,'unavailable');
});
test('regional exports respect Retry-After instead of retrying a blocked source on every visitor',async()=>{
 let at=now,calls=0;const source=createAnimeRegionalSource({clock:()=>at,fetcher:async url=>{if(url===GOOGLE_BR_RSS){calls++;return new Response('',{status:429,headers:{'Retry-After':'3600'}});}throw Error('offline');}});
 await source();at=new Date(now.getTime()+300001);await source();assert.equal(calls,1);
 at=new Date(now.getTime()+3600001);await source();assert.equal(calls,2);
});
