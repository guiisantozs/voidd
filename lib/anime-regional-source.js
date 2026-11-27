// Only published exports, never Google Explore/Crunchyroll internal endpoints.
// No account, API key, regional audience estimates, or arbitrary URLs.
import {resourceMetrics} from './resource-metrics.js';
import {completeAnimeDate} from './anime-relevance.js';
import {retryAfterSeconds} from './provider-guard.js';

export const GOOGLE_BR_RSS='https://trends.google.com/trending/rss?geo=BR';
export const NETFLIX_COUNTRIES_TSV='https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv';
export const BRAZIL_ANIME_FEEDS=[{name:'JBox RSS',url:'https://www.jbox.com.br/feed/',host:'www.jbox.com.br'},{name:'IntoxiAnime RSS',url:'https://www.intoxianime.com/feed/',host:'www.intoxianime.com'}];
const DAY=86400000,TTL=6*3600000;
const key=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const names=item=>[item.titulo,item.englishTitle,item.originalTitle,...item.alternativeTitles||[]].map(key).filter(name=>name.length>=5);
const decode=value=>String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,entity=>{
 const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
 if(named[entity])return named[entity];const code=entity.toLowerCase().startsWith('&#x')?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));
 return Number.isInteger(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
});
const tag=(xml,name)=>decode(xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'').trim();
const recent=(date,now,days)=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=now.getTime()&&now.getTime()-Date.parse(date)<=days*DAY;

export function parseGoogleBrazilRss(xml,now=new Date()){
 if(typeof xml!=='string'||xml.length>1024*1024||!/<rss\b/.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('REGIONAL_RSS_FORMAT');
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].flatMap(match=>{
  const title=tag(match[1],'title'),date=tag(match[1],'pubDate');
  return title&&recent(date,now,7)?[{source:'Google Trends RSS',country:'BR',title,date:new Date(date).toISOString(),url:GOOGLE_BR_RSS}]:[];
 });
}

export function parseBrazilAnimeNews(xml,source,now=new Date()){
 if(typeof xml!=='string'||xml.length>1024*1024||!/<rss\b/.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('REGIONAL_RSS_FORMAT');
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].flatMap(match=>{
  const title=tag(match[1],'title'),date=tag(match[1],'pubDate'),url=tag(match[1],'link');let valid=false;
  try{const parsed=new URL(url);valid=parsed.protocol==='https:'&&parsed.hostname.replace(/^www\./,'')===source.host.replace(/^www\./,'');}catch{}
  const eventKind=/anunci|previs|janela|trailer|teaser|rumor/.test(key(title))?'announcement':/\bepisodio\b/.test(key(title))?'episode-news':'coverage';
  return title&&valid&&recent(date,now,7)?[{source:source.name,country:'BR',title,date:new Date(date).toISOString(),url,eventKind}]:[];
 });
}

// Process the public historical file incrementally. Keep only BR/30 days in
// memory; never persist or return the 33+ MB worldwide historical dataset.
export async function parseNetflixBrazilStream(body,now=new Date(),{stopAtBrazilHistory=false}={}){
 const reader=body.getReader(),decoder=new TextDecoder(),rows=[],weeks=new Set();let pending='',headers=null,bytes=0,previousBrazilWeek=null,ordered=true,complete=false;
 function line(text){
  const fields=text.replace(/\r$/,'').split('\t');
  if(!headers){headers=fields;if(!['country_iso2','week','category','weekly_rank','show_title','season_title'].every(name=>headers.includes(name)))throw Error('NETFLIX_HEADER');return;}
  const row=Object.fromEntries(headers.map((name,index)=>[name,fields[index]||'']));
  if(row.country_iso2!=='BR'||!completeAnimeDate(row.week))return;
  if(previousBrazilWeek&&row.week>previousBrazilWeek)ordered=false;
  previousBrazilWeek=row.week;
  // The published export groups countries and descending weeks. Once two
  // recent weeks and their ordering have been observed, stop at BR history.
  // If ordering changes, scan normally; never manufacture a missing rank.
  if(stopAtBrazilHistory&&ordered&&weeks.size>=2&&Date.parse(row.week)<now.getTime()-30*DAY){complete=true;return;}
  if(!recent(row.week,now,30)||!['TV','Films'].includes(row.category))return;
  weeks.add(row.week);
  const rank=Number(row.weekly_rank);if(!Number.isInteger(rank)||rank<1||rank>10||!row.show_title)return;
  rows.push({source:'Netflix Top 10',country:'BR',title:row.show_title,seasonTitle:row.season_title,date:row.week,rank,category:row.category,url:'https://www.netflix.com/tudum/top10/brazil/'+(row.category==='TV'?'tv':'films')});
 }
 try{
  for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>48*1024*1024)throw Error('NETFLIX_EXPORT_TOO_LARGE');
   pending+=decoder.decode(next.value,{stream:true});let end;
   while((end=pending.indexOf('\n'))!==-1){line(pending.slice(0,end));pending=pending.slice(end+1);if(complete)return rows;}
   if(pending.length>65536)throw Error('NETFLIX_INVALID_ROW');
  }
  pending+=decoder.decode();if(pending)line(pending);if(!headers)throw Error('NETFLIX_EMPTY');return rows;
 }finally{await reader.cancel().catch(()=>{});}
}

export function attachBrazilEvidence(items,snapshot){
 const allNames=new Map();
 for(const item of items)for(const name of names(item)){if(!allNames.has(name))allNames.set(name,new Set());allNames.get(name).add(item.id);}
 return items.map(item=>{
  const own=names(item),regionalEvidence=[],regionalHints=[];
  const related=(item.trendSignals?.relations||[]).filter(row=>row.relation==='PREQUEL').map(row=>row.artwork).filter(Boolean);
  for(const row of snapshot.entries||[]){
   const title=key(row.title),season=key(row.seasonTitle),exact=own.some(name=>name===title&&allNames.get(name)?.size===1);
   if(row.source==='Google Trends RSS'){
    // Query text must match an unambiguous full production alias, not a word
    // in an unrelated news headline. Do not claim a 7/30-day growth series.
    if(exact)regionalEvidence.push({...row,scope:'production',score:.8,association:'exact-unique-production-title'});
    else if(related.some(parent=>names(parent).includes(title)))regionalHints.push({...row,scope:'franchise',association:'explicit-prequel-title'});
   }else if(row.source==='Netflix Top 10'){
    const exactSeason=own.some(name=>name===season&&allNames.get(name)?.size===1);
    const firstSeason=exact&&!related.length&&season===title+' season 1';
    const film=exact&&item.format==='Movie'&&row.category==='Films';
    if(exactSeason||firstSeason||film)regionalEvidence.push({...row,scope:'production',score:.5+(11-row.rank)/20,association:exactSeason?'exact-season-title':film?'exact-film-title':'first-season-title'});
    else if(exact||related.some(parent=>names(parent).includes(title)))regionalHints.push({...row,scope:'franchise',association:'season-not-verified; no-production-audience-claim'});
   }else if(BRAZIL_ANIME_FEEDS.some(feed=>feed.name===row.source)){
    if(/\blive action\b/.test(title))continue;
    const contains=name=>(' '+title+' ').includes(' '+name+' '),ownMatch=own.some(name=>name.includes(' ')&&contains(name)&&allNames.get(name)?.size===1);
    const seasonNumber=value=>{const found=value.match(/(\d+)(?:st|nd|rd|th|a|o)? (?:season|temporada)|(?:season|temporada) (\d+)/);return found?Number(found[1]||found[2]):null;};
    const number=own.map(seasonNumber).find(Boolean),articleNumber=seasonNumber(title);
    const parentMatch=related.some(parent=>names(parent).some(contains));
    const verifiedSeason=parentMatch&&number&&number===articleNumber;
    const differentFormat=/\bfilme\b/.test(title)&&item.format!=='Movie';
    if((ownMatch||verifiedSeason)&&!differentFormat)regionalEvidence.push({...row,scope:'production',score:.60,association:verifiedSeason?'explicit-prequel-and-matching-season-number':'unique-production-title-in-brazilian-news'});
    else if(parentMatch||ownMatch)regionalHints.push({...row,scope:'franchise',association:'brazilian-news; specific-production-not-verified'});
   }
  }
  return {...item,regionalEvidence,regionalHints};
 });
}

export function createAnimeRegionalSource({fetcher=(...args)=>fetch(...args),clock=()=>new Date()}={}){
 let cached=null,pending=null,expires=0,retryAt=0,unavailableSources=null;const blocked=new Map();
 const staleCopy=()=>({...structuredClone(cached),stale:true,sources:unavailableSources||cached.sources,entries:cached.entries.map(row=>({...row,stale:true}))});
 return async()=>{
  const now=clock();if(cached&&now.getTime()<expires)return structuredClone(cached);
  if(now.getTime()<retryAt)return cached&&now.getTime()-expires<=DAY?staleCopy():{entries:[],sources:unavailableSources||[],unavailable:true};
  if(pending)return pending.then(structuredClone);
  pending=(async()=>{
   const definitions=[{name:'Google Trends RSS',url:GOOGLE_BR_RSS,parse:async response=>parseGoogleBrazilRss(await limitedText(response,1024*1024),now)},{name:'Netflix Top 10',url:NETFLIX_COUNTRIES_TSV,parse:response=>parseNetflixBrazilStream(response.body,now,{stopAtBrazilHistory:true})},...BRAZIL_ANIME_FEEDS.map(source=>({...source,parse:async response=>parseBrazilAnimeNews(await limitedText(response,1024*1024),source,now)}))];
   const results=await Promise.allSettled(definitions.map(async source=>{
    const start=Date.now();
    try{
     if(now.getTime()<(blocked.get(source.name)||0))throw Error('REGIONAL_COOLDOWN');
     const response=await fetcher(source.url,{headers:{Accept:source.name==='Netflix Top 10'?'text/tab-separated-values':'application/rss+xml, text/xml'},signal:AbortSignal.timeout(source.name==='Netflix Top 10'?40000:10000)});
     if(!response.ok){if(response.status===429||response.status===503&&response.headers?.get('Retry-After'))blocked.set(source.name,now.getTime()+retryAfterSeconds(response.headers?.get('Retry-After'))*1000);throw Error('REGIONAL_HTTP_'+response.status);}
     return await source.parse(response);
    }catch(error){resourceMetrics.record('anime:regional:'+source.name,'errors');throw error;}
    finally{resourceMetrics.record('anime:regional:'+source.name,'requests',Date.now()-start);}
   }));
   const sources=results.map((result,index)=>({name:definitions[index].name,url:definitions[index].url,status:result.status==='fulfilled'?'available':'unavailable',entries:result.status==='fulfilled'?result.value.length:0,checkedAt:now.toISOString()}));
   if(results.every(result=>result.status==='rejected')){
    unavailableSources=sources;
    retryAt=now.getTime()+300000;
    if(cached&&now.getTime()-expires<=DAY)return staleCopy();
    return {entries:[],sources,unavailable:true};
   }
   const entries=results.flatMap((result,index)=>{
    if(result.status==='fulfilled')return result.value;
    const name=definitions[index].name,previous=cached?.sources?.find(source=>source.name===name);
    if(!previous||!recent(previous.lastSuccessAt||previous.checkedAt,now,1))return [];
    return (cached.entries||[]).filter(row=>row.source===name).map(row=>({...row,stale:true}));
   });
   for(const source of sources){const previous=cached?.sources?.find(row=>row.name===source.name);source.lastSuccessAt=source.status==='available'?now.toISOString():previous?.lastSuccessAt||previous?.checkedAt||null;}
   unavailableSources=null;cached={entries,sources,updatedAt:now.toISOString()};expires=now.getTime()+TTL;return structuredClone(cached);
  })().finally(()=>{pending=null;});
  return pending;
 };
}
async function limitedText(response,limit){
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>limit)throw Error('REGIONAL_FEED_TOO_LARGE');text+=decoder.decode(next.value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel().catch(()=>{});}
}
export const loadBrazilAnimeSignals=createAnimeRegionalSource();
