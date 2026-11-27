import {normalizeMovie} from './movie-catalog.js';

const TTL=3600000,cache=new Map(),pending=new Map();
export function clearSimilarityCache(){cache.clear();pending.clear();}
const text=value=>String(value||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const ids=values=>new Set((values||[]).map(value=>value.id).filter(Number.isInteger));
const overlap=(a,b)=>[...a].filter(id=>b.has(id));
const generic=/^(based on|adaptation|sequel|prequel|remake|reboot|duringcredits|aftercredits|post.credit|woman director|independent film|female protagonist|male protagonist)|^(dc comics|marvel comics|friendship|family|love|death|murder|violence|revenge|father|mother|brother|sister|new york city|london|paris|los angeles|usa)$/;
const precise=/superhero|supernatural|haunted house|possession|exorcism|demon|ghost|witchcraft|vampire|zombie|slasher|space (travel|opera|exploration|colon)|astronaut|black hole|wormhole|alien invasion|time travel|artificial intelligence|cyberpunk|dystopia|romantic comedy|forbidden love|first love|love triangle|unrequited love|fairy tale|talking animal|magic|dragon|martial arts|espionage|spy|heist|assassin|organized crime/;
const topics=[/space (travel|exploration|mission|colon)|astronaut|black hole|wormhole|interstellar|spacecraft/,/supernatural|haunted|exorcism|demon|ghost|possession/,/superhero|superpower|masked superhero/,/forbidden love|first love|love triangle|unrequited love|romantic/,/espionage|secret agent|undercover|\bspy\b/,/magic|wizard|sorcer|fairy tale/];
const narrative=/cinematic universe|extended universe|^dc universe|wizarding world|middle.earth|conjuring universe|monsterverse/;
const characters=[{query:'Batman',match:/\bbatman\b|\bgotham city\b/},{query:'Spider-Man',match:/spider[ -]?man|homem[ -]?aranha/}];
export function movieSignature(movie={}){
  const keywords=movie.keywords?.keywords||[];
  const dominant=topics.map(topic=>keywords.filter(k=>topic.test(text(k.name)))).sort((a,b)=>b.length-a.length)[0]||[];
  return {genres:new Set(movie.genre_ids||movie.genres?.map(g=>g.id)||[]),keywords,
    dominant:new Set(dominant.length>=2?dominant.map(k=>k.id):[]),
    meaningful:new Set(keywords.filter(k=>!generic.test(text(k.name))).map(k=>k.id)),
    precise:new Set(keywords.filter(k=>precise.test(text(k.name))).map(k=>k.id)),
    universes:new Set(keywords.filter(k=>narrative.test(text(k.name))).map(k=>k.id)),
    directors:ids(movie.credits?.crew?.filter(p=>p.job==='Director')),cast:ids(movie.credits?.cast?.slice(0,8)),companies:ids(movie.production_companies),
    collection:movie.belongs_to_collection?.id||null,
    character:characters.find(c=>c.match.test(text(`${movie.original_title||movie.title} ${keywords.map(k=>k.name).join(' ')}`)))||null};
}

export function movieRelationship(seed,movie,evidence={}){
  if(!movie?.id||Number(movie.id)===Number(seed.id)||movie.adult||movie.video)return null;
  const a=movieSignature(seed),b=movieSignature(movie),genres=overlap(a.genres,b.genres);
  // Fictional films do not acquire documentary/TV extras through character searches.
  if(!a.genres.has(99)&&b.genres.has(99)||!a.genres.has(10770)&&b.genres.has(10770))return null;
  const keywords=new Set([...b.meaningful,...(evidence.keywords||[])]);
  const common=overlap(a.meaningful,keywords),strong=common.filter(id=>a.precise.has(id));
  const directors=overlap(a.directors,b.directors).length+(evidence.director?1:0);
  const cast=overlap(a.cast,b.cast).length,companies=overlap(a.companies,b.companies).length;
  let tier;
  if(evidence.collection||a.collection&&a.collection===b.collection)tier=1;
  else if(evidence.universe||overlap(a.universes,b.universes).length)tier=2;
  else if(evidence.character||a.character&&a.character.match.test(text(movie.original_title||movie.title)))tier=3;
  else {
    const specificGenre=genres.some(id=>[16,27,878,10749,14,9648,37,10402].includes(id));
    if(!genres.length||a.genres.has(16)!==b.genres.has(16)||a.genres.has(27)&&!b.genres.has(27)
      ||b.genres.has(35)&&!a.genres.has(35)||b.genres.has(10751)&&!a.genres.has(10751))return null;
    if(a.dominant.size&&!common.some(id=>a.dominant.has(id)))return null;
    if(Number.isFinite(movie.vote_count)&&movie.vote_count<20)return null;
    if(common.length>=2||strong.length&&specificGenre)tier=4;
    else if(directors&&genres.length>=2||cast>=2&&specificGenre&&common.length)tier=5;
    else return null;
  }
  return {tier,collectionDistance:evidence.distance??null,score:[0,10000,8000,6000,4000,2000][tier]+common.length*35+strong.length*20+genres.length*12+Math.min(directors,1)*25+Math.min(cast,3)*6+Math.min(companies,2)*3};
}

async function request(path,params={},deadline=Date.now()+5000){
  const key=process.env.TMDB_API_KEY;if(!key||key==='cole_sua_chave_aqui')throw Error('CONFIG');
  const url=new URL(`https://api.themoviedb.org/3/${path}`);
  Object.entries({language:'pt-BR',region:'BR',include_adult:false,...params}).forEach(([name,value])=>url.searchParams.set(name,String(value)));
  const cacheKey=url.href,saved=cache.get(cacheKey);
  if(saved?.expires>Date.now())return saved.data;if(pending.has(cacheKey))return pending.get(cacheKey);
  if(Date.now()>=deadline)throw Error('TIMEOUT');
  url.searchParams.set('api_key',key);
  const task=(async()=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))});
    if(!response.ok)throw Error('UPSTREAM');
    const data=await response.json();if(cache.size>=400)cache.delete(cache.keys().next().value);cache.set(cacheKey,{data,expires:Date.now()+TTL});return data;
  })().finally(()=>pending.delete(cacheKey));pending.set(cacheKey,task);return task;
}
async function mapLimit(jobs,limit){let next=0;return Promise.all(Array.from({length:Math.min(limit,jobs.length)},async()=>{while(next<jobs.length){const job=jobs[next++];await job();}}));}

export async function loadRelatedMovies(id){
  const seed=await request(`movie/${id}`,{append_to_response:'keywords,credits,recommendations,similar'});
  if(!seed?.id)throw Error('UPSTREAM');
  const signature=movieSignature(seed),candidates=new Map(),jobs=[],deadline=Date.now()+4500;let partial=false;
  function add(movie,evidence={}){
    if(!movie?.id||Number(movie.id)===Number(seed.id)||movie.adult)return;
    const old=candidates.get(movie.id),merged={...old?.evidence,...evidence};
    merged.keywords=[...new Set([...(old?.evidence.keywords||[]),...(evidence.keywords||[])])];
    candidates.set(movie.id,{movie:old?.enriched?old.movie:{...old?.movie,...movie},evidence:merged,enriched:old?.enriched});
  }
  const run=load=>jobs.push(async()=>{try{await load();}catch{partial=true;}});
  const discover=(params,evidence)=>run(async()=>{const data=await request('discover/movie',{sort_by:'vote_count.desc',...params},deadline);for(const movie of data.results||[])add(movie,evidence);});
  if(signature.collection)run(async()=>{
    const data=await request(`collection/${signature.collection}`,{},deadline),parts=[...(data.parts||[])].sort((a,b)=>(a.release_date||'9999').localeCompare(b.release_date||'9999')||a.id-b.id),at=parts.findIndex(movie=>movie.id===seed.id);
    parts.forEach((movie,index)=>add(movie,{collection:true,distance:at<0?null:Math.abs(index-at)}));
  });
  for(const keyword of [...signature.universes].slice(0,2))discover({with_keywords:keyword},{universe:true});
  if(signature.character)run(async()=>{
    const data=await request('search/movie',{query:signature.character.query},deadline);
    for(const movie of data.results||[])if(signature.character.match.test(text(movie.original_title||movie.title)))add(movie,{character:true});
  });
  const themes=signature.keywords.filter(k=>signature.meaningful.has(k.id)&&!signature.universes.has(k.id))
    .sort((a,b)=>Number(signature.dominant.has(b.id))-Number(signature.dominant.has(a.id))||Number(signature.precise.has(b.id))-Number(signature.precise.has(a.id))||a.id-b.id).slice(0,4);
  const genreFilter=[...signature.genres].join('|');
  for(const [a,b] of [[0,1],[0,2],[1,2]])if(themes[a]&&themes[b]){
    const keywords=[themes[a].id,themes[b].id];discover({with_keywords:keywords.join(','),with_genres:genreFilter},{keywords});
  }
  if(themes[0]&&signature.precise.has(themes[0].id))discover({with_keywords:themes[0].id,with_genres:genreFilter},{keywords:[themes[0].id]});
  if(signature.directors.size&&signature.genres.size>=2)discover({with_crew:[...signature.directors][0],with_genres:[...signature.genres].join(',')},{director:true});
  // Generic endpoints supply candidates only: eight bounded metadata checks must
  // establish a real relationship. No popularity-only or studio-only fallback.
  const genericCandidates=[...new Map([...(seed.recommendations?.results||[]).slice(0,6),...(seed.similar?.results||[]).slice(0,4)].map(m=>[m.id,m])).values()].filter(m=>m.id!==seed.id&&!m.adult).slice(0,8);
  for(const movie of genericCandidates)run(async()=>{
    const profile=await request(`movie/${movie.id}`,{append_to_response:'keywords,credits'},deadline);
    add(profile);candidates.get(profile.id).enriched=true;
  });
  await mapLimit(jobs,6);
  const movies=[...candidates.values()].map(({movie,evidence})=>({movie,relation:movieRelationship(seed,movie,evidence)})).filter(row=>row.relation)
    .sort((a,b)=>a.relation.tier-b.relation.tier||(a.relation.tier===1?(a.relation.collectionDistance??Infinity)-(b.relation.collectionDistance??Infinity):0)||b.relation.score-a.relation.score||(a.movie.release_date||'9999').localeCompare(b.movie.release_date||'9999')||a.movie.id-b.movie.id)
    .map(({movie,relation})=>({...normalizeMovie(movie),similarity:relation}));
  return {movies,partial};
}
