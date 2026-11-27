import {getAnimeDetail} from './anime-catalog.js';
import {enrichAnimeArtwork} from './anime-artwork.js';
import {animeCache,ANIME_TTL} from './anime-cache.js';
export const cleanAnimeSynopsis=value=>String(value||'').replace(/\[Written by MAL Rewrite\]/gi,'').replace(/\(?\s*Source:\s*[^\n)]*\)?/gi,'').replace(/\n{3,}/g,'\n\n').trim();
export function createAnimeDetailService({cache=animeCache,detail=getAnimeDetail,enrich=enrichAnimeArtwork,translate=null}={}){
 return {async detail(id){const result=await cache.get('detail:v1:'+id,async()=>{
  const item=await enrich(await detail(id)),saved=await cache.peek('translation:v1:'+id),english=cleanAnimeSynopsis(item.sinopse),portuguese=cleanAnimeSynopsis(saved?.synopsis_pt||item.synopsisTmdbPt);
  let synopsis=portuguese,source=saved?.synopsis_pt?'translation-cache':portuguese?'tmdb':null;
  if(!synopsis&&translate&&english.length>=40)try{const result=await cache.get('translation:v1:'+id,async()=>{const synopsis_pt=cleanAnimeSynopsis(await translate(english));if(!synopsis_pt)throw Error('EMPTY_TRANSLATION');return {synopsis_pt};},{ttl:ANIME_TTL.finished});synopsis=result.synopsis_pt;source='translation-cache';}catch{/* Translation is optional: keep catalogue data and the original synopsis. */}
  let fallback=english,label=synopsis&&item.synopsisScope==='series'?'Sinopse da série':'Sinopse';
  if(!synopsis&&english.length<40){const previous=item.related?.find(row=>row.relation.toLowerCase()==='prequel');if(previous)try{const parent=await cache.peek('detail:v1:'+previous.id)||await detail(previous.id);if(cleanAnimeSynopsis(parent.sinopse).length>=40){fallback=cleanAnimeSynopsis(parent.sinopse);synopsis=parent.synopsis_pt||null;source='previous-production';label='Sinopse da série';}}catch{/* Preserve the production's supplied text. */}}
  return {...item,sinopse:synopsis||fallback,synopsis_pt:synopsis||null,synopsisSource:source,synopsisLabel:label,synopsisLanguage:synopsis?'pt-BR':'en',partial:['lookup-failed','provider-cooldown','franchise-gallery-unavailable'].includes(item.artworkMatchStatus)};
 },{ttl:item=>item.releaseStatus==='Returning Series'?ANIME_TTL.airing:ANIME_TTL.static});const preview=await cache.peek('characters:v1:'+id);const {music,...publicItem}=result;return {...publicItem,characterPreview:preview?.characters?.slice(0,6)||[]};}};
}
export const animeDetailService=createAnimeDetailService();
