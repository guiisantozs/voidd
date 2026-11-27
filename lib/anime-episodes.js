import {animeResource,getAnimeDetail,normalizeAnimeEpisode} from './anime-catalog.js';
import {animeCache,ANIME_TTL} from './anime-cache.js';
import {decodeAnimeId} from './anime-provider.js';
export function createAnimeEpisodes({cache=animeCache,resource=animeResource,detail=getAnimeDetail}={}){return async(id,page=1)=>{
 if(!decodeAnimeId(id)||!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
 return cache.get(`episodes:v1:${id}:${page}`,async()=>{
  const show=await cache.peek('detail:v1:'+id,{fresh:true})||await detail(id);if(show.format==='Movie')throw Error('INVALID');
  const ttl=show.releaseStatus==='Ended'?ANIME_TTL.finished:ANIME_TTL.airing,mal=decodeAnimeId(id),first=await resource(`anime/${mal}/episodes`,{page:1},ttl),size=first.pagination?.items?.per_page||50,offset=(page-1)*25,sourcePage=Math.floor(offset/size)+1,inside=offset%size;
  const source=sourcePage===1?first:await resource(`anime/${mal}/episodes`,{page:sourcePage},ttl),episodes=(source.data||[]).slice(inside,inside+25).map(row=>normalizeAnimeEpisode(row,id)),hasNext=inside+25<(source.data||[]).length||!!source.pagination?.has_next_page;
  return {seriesId:Number(id),seasonNumber:1,episodeNumber:0,name:show.displayTitle||show.titulo,airDate:show.estreia,episodes,page,nextPage:hasNext?page+1:null,finished:show.releaseStatus==='Ended'};
 },{ttl:data=>data.finished?ANIME_TTL.finished:ANIME_TTL.airing});
 };}
export const animeEpisodes=createAnimeEpisodes();
