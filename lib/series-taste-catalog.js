import {seriesResource,seriesMetadata} from './series-catalog.js';
import {normalizeSeries,seriesAllowed} from './series-model.js';
import {seriesTasteIds,rankTasteRecommendations,SERIES_TASTE_RULES} from './series-tastes.js';

export async function tasteRecommendations(ids,{resource=seriesResource,metadata=seriesMetadata,today=new Date().toISOString().slice(0,10)}={}){
 ids=seriesTasteIds(ids);
 const loaded=await metadata(ids);if(loaded.partial||loaded.items.length!==3)throw Error('PREFERENCES_METADATA_UNAVAILABLE');
 const seeds=loaded.items,genreCounts=new Map(),keyCounts=new Map();
 for(const seed of seeds){for(const id of seed.genreIds||[])genreCounts.set(id,(genreCounts.get(id)||0)+1);for(const key of seed.keywords||[])keyCounts.set(key.id,(keyCounts.get(key.id)||0)+1);}
 const top=(map,n)=>[...map].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,n).map(([id])=>id);
 const base={include_adult:false,'first_air_date.lte':today,'vote_count.gte':SERIES_TASTE_RULES.minVotes,'vote_average.gte':SERIES_TASTE_RULES.minRating,sort_by:'popularity.desc',without_keywords:'210024'};
 const jobs=seeds.flatMap(seed=>['recommendations','similar'].map(kind=>({seed:String(seed.id),kind,load:()=>resource(`tv/${seed.id}/${kind}`,{page:1})})));
 const genres=top(genreCounts,3),keywords=top(keyCounts,6);
 if(genres.length)jobs.push({kind:'genres',load:()=>resource('discover/tv',{...base,with_genres:genres.join('|')})});
 if(keywords.length)jobs.push({kind:'keywords',load:()=>resource('discover/tv',{...base,with_keywords:keywords.join('|')})});
 const result=await Promise.allSettled(jobs.map(job=>job.load()));
 if(result.every(r=>r.status==='rejected'))throw Error('RECOMMENDATIONS_UNAVAILABLE');
 const support=new Map(),pool=new Map();
 for(let index=0;index<result.length;index++){
  if(result[index].status!=='fulfilled')continue;
  for(const [rank,row] of (result[index].value.results||[]).entries()){
   if(!seriesAllowed(row))continue;const id=String(row.id);pool.set(id,normalizeSeries(row));
   const job=jobs[index];if(job.seed)support.set(id,[...(support.get(id)||[]),{seed:job.seed,kind:job.kind,rank}]);
  }
 }
 const candidates=rankTasteRecommendations(seeds,[...pool.values()],support,{today,limit:SERIES_TASTE_RULES.candidateLimit});
 const hydrated={items:[],partial:false};
 // The shared metadata endpoint accepts at most twenty IDs per batch.
 for(let offset=0;offset<candidates.length;offset+=20){const batch=await metadata(candidates.slice(offset,offset+20).map(item=>item.id));hydrated.items.push(...batch.items);hydrated.partial ||= batch.partial;}
 return {movies:rankTasteRecommendations(seeds,hydrated.items,support,{today}),partial:hydrated.partial||result.some(r=>r.status==='rejected')};
}
