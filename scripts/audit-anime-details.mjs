// Read-only upstream audit. Simulates persistent caches in memory, so it never
// clears or writes the hosted cache and never touches account data.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const realFetch=globalThis.fetch,calls=[];let step='setup';
globalThis.fetch=async(input,options)=>{const url=new URL(input instanceof Request?input.url:String(input)),external=['jikan.lucashdo.com','api.themoviedb.org','graphql.anilist.co','webservice.fanart.tv'].includes(url.hostname);if(external)calls.push({step,host:url.hostname,path:url.pathname});return realFetch(input,options);};
const {createAnimeCache}=await import('../lib/anime-cache.js');
const {createAnimeClient,getAnimeDetail}=await import('../lib/anime-catalog.js');
const {createAnimeDetailService}=await import('../lib/anime-detail-service.js');
const {enrichAnimeArtwork}=await import('../lib/anime-artwork.js');
const {createAnimeFranchise}=await import('../lib/anime-franchise.js');
const {createAnimeSimilar}=await import('../lib/anime-similar.js');
const {createAnimePeople}=await import('../lib/anime-people.js');
const {createAnimeEpisodes}=await import('../lib/anime-episodes.js');
const rows=new Map(),storage={read:async k=>rows.get(k)||null,claim:async()=>true,release:async()=>{},write:async(k,payload,ttl)=>rows.set(k,{payload,expires_at:new Date(Date.now()+ttl).toISOString()}),catalog:async()=>[...rows].filter(([k])=>k.startsWith('detail:v1:')).map(([,v])=>v.payload)};
function services(){const cache=createAnimeCache({store:storage}),resource=createAnimeClient().resource,detail=id=>getAnimeDetail(id,{resource}),view=createAnimeDetailService({cache,detail,enrich:enrichAnimeArtwork}),franchise=createAnimeFranchise({cache,detail});return {view,franchise,similar:createAnimeSimilar({cache,resource,franchise}),people:createAnimePeople({cache,resource,detail}),episodes:createAnimeEpisodes({cache,resource,detail})};}
const id=Number(process.argv[2]||9000034572),report=[];
for(const phase of ['cold','warm-new-instance']){const s=services();for(const [name,run] of [['page',()=>s.view.detail(id)],['seasons',()=>s.franchise(id)],['similar',()=>s.similar(id)],['characters',()=>s.people.characters(id)],['voice-modal',async()=>{}],['music',()=>s.people.music(id)],['staff',()=>s.people.staff(id)],['episodes-page-1',()=>s.episodes(id,1)],['episodes-page-2',()=>s.episodes(id,2)]]){step=phase+':'+name;const start=calls.length;try{await run();report.push({phase,action:name,externalCalls:calls.length-start});}catch(error){report.push({phase,action:name,externalCalls:calls.length-start,error:error.message});}}}
console.log(JSON.stringify({id,report,totals:{cold:report.filter(r=>r.phase==='cold').reduce((n,r)=>n+r.externalCalls,0),warm:report.filter(r=>r.phase==='warm-new-instance').reduce((n,r)=>n+r.externalCalls,0)},calls},null,2));
