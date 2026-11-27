import {getAnimeDetail} from './anime-catalog.js';
import {animeCache,ANIME_TTL} from './anime-cache.js';
const chain=new Set(['prequel','sequel','parent story','full story']),extra=new Set(['side story','spin-off','spin off','alternative version','summary']);
export const animeSeasonFormat=item=>['TV','TV_SHORT','ONA'].includes(item.format);
export function animeFranchiseCard(item){return {id:item.id,categoria:'animes',titulo:item.titulo,displayTitle:item.displayTitle||item.englishTitle||item.titulo,poster:item.poster,posterFallback:item.posterFallback,ano:item.ano,estreia:item.estreia,nota:item.nota,format:item.format,numberOfEpisodes:item.numberOfEpisodes,statusLabel:item.statusLabel,releaseStatus:item.releaseStatus,broadcast:item.broadcast,genreIds:item.genreIds||[],themes:item.themes||[]};}
export function createAnimeFranchise({cache=animeCache,detail=getAnimeDetail}={}){return async id=>cache.get('franchise:v1:'+id,async()=>{
 const queue=[{id:Number(id),depth:0,side:false}],visited=new Set(),seasons=[],specials=[];let partial=false;
 while(queue.length&&visited.size<12){const next=queue.shift();if(visited.has(next.id))continue;visited.add(next.id);
  let item;try{item=await cache.peek('detail:v1:'+next.id,{fresh:true})||await detail(next.id);}catch{partial=true;continue;}
  const row=animeFranchiseCard(item);(animeSeasonFormat(item)&&!next.side?seasons:specials).push(row);
  if(next.depth>=11)continue;
  const relations=(item.related||[]).filter(row=>chain.has(row.relation.toLowerCase())||extra.has(row.relation.toLowerCase())).sort((a,b)=>Number(!chain.has(a.relation.toLowerCase()))-Number(!chain.has(b.relation.toLowerCase())));
  for(const relation of relations){if(relation.id&&!visited.has(relation.id)&&!queue.some(row=>row.id===relation.id))queue.push({id:relation.id,depth:next.depth+1,side:next.side||extra.has(relation.relation.toLowerCase())});}
 }
 const chronological=(a,b)=>(a.estreia||`${a.ano||9999}-99-99`).localeCompare(b.estreia||`${b.ano||9999}-99-99`)||a.id-b.id;
 seasons.sort(chronological);specials.sort(chronological);return {seasons:seasons.map((row,index)=>({...row,seasonLabel:'Temporada '+(index+1),current:row.id===Number(id)})),specials,partial,truncated:queue.length>0};
 },{ttl:ANIME_TTL.static});}
export const animeFranchise=createAnimeFranchise();
