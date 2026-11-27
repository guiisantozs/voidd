import {searchMoviePage} from './movie-search.js';
import {seriesResource} from './series-catalog.js';
import {SEARCH_CACHE_MS,normalizeSearchTerm,shortSearch} from './catalog-cache-policy.js';
import { searchGames,parseGameSearch } from './game-search.js';
import { editorialGames } from './games.js';
import { favoriteSnapshot,profileMedia } from './profile.js';
import {useIGDBCatalog} from './game-provider.js';
import {searchAnime} from './anime-catalog.js';

const cache=new Map(),pending=new Map();
export function parseProfileSearch(query){
 if(typeof query.media!=='string'||!profileMedia.some(m=>m.key===query.media)||typeof(query.q??'')!=='string'||typeof(query.page??'1')!=='string')throw Error('INVALID');
 const q=normalizeSearchTerm(query.q),page=query.page??'1';
 if(q.length>80||shortSearch(q)||!/^[1-9]\d{0,2}$/.test(page)||Number(page)>500)throw Error('INVALID');
 return {media:query.media,q,page:Number(page)};
}
export function clearProfileSearchCache(){cache.clear();pending.clear();}
export async function searchProfileMedia({media,q,page=1},now=Date.now()){
  q=normalizeSearchTerm(q);
  const key=JSON.stringify([useIGDBCatalog()?'igdb':'rawg',media,q.toLocaleLowerCase('pt-BR'),page]);if(cache.get(key)?.expires>now)return cache.get(key).data;if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    let items=[],notice='',pagination={page,hasNext:false};
    if(media==='filmes'){const data=await searchMoviePage({q,genre:'all',year:'',page},now);items=data.movies;pagination=data.pagination;}
    else if(media==='jogos'){
      if(!useIGDBCatalog()&&(!process.env.RAWG_API_KEY||process.env.RAWG_API_KEY==='cole_sua_chave_aqui')){const matches=editorialGames.filter(p=>p.titulo.toLowerCase().includes(q.toLowerCase()));items=matches.slice((page-1)*20,page*20);pagination.hasNext=page*20<matches.length;notice='Seleção de jogos do VOID. A busca completa depende da configuração do catálogo RAWG.';}
      else{const data=await searchGames(parseGameSearch({q,page:String(page)}));items=data.jogos;pagination={page,hasNext:!!data.pagination?.hasNext};}
    }else if(media==='animes'){const data=await searchAnime({q,page});items=data.movies;pagination=data.pagination;}else{
      const params={include_adult:false,page};if(q)params.query=q;
      if(media==='animes'&&!q){params.with_genres='16';params.with_origin_country='JP';}
      const data=await seriesResource(q?'search/tv':media==='animes'?'discover/tv':'trending/tv/week',params,undefined,SEARCH_CACHE_MS);
      pagination.hasNext=page<Math.min(data.total_pages||1,500);
      items=(data.results||[]).filter(p=>!p.adult&&(media!=='animes'||(p.genre_ids?.includes(16)&&p.origin_country?.includes('JP')))).map(p=>({id:p.id,categoria:media,titulo:p.name,poster:p.poster_path?`https://image.tmdb.org/t/p/w342${p.poster_path}`:'',ano:(p.first_air_date||'').slice(0,4)}));
    }
    const data={items:(media==='animes'?items:items.slice(0,20)).map(favoriteSnapshot),notice,pagination};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{expires:now+SEARCH_CACHE_MS,data});return data;
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
}
