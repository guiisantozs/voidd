import {SERIES_RULES,seriesGenreNames} from '../config/series.js';
import {parseRating} from './ratings.js';
// One anime policy for catalogue, hero, recommendations and social rows.
export function seriesAllowed(row){
 if(!row||row.adult||!(row.poster_path||row.poster)||row.categoria&&row.categoria!=='series')return false;
 if(!SERIES_RULES.excludeAnime)return true;
 const genres=row.genre_ids||row.genreIds||row.genres?.map(genre=>genre.id)||[];
 const countries=row.origin_country||row.originCountries||[],language=row.original_language||row.originalLanguage;
 const keywords=Array.isArray(row.keywords)?row.keywords:row.keywords?.results||[];
 return !row.isAnime&&!keywords.some(keyword=>/\banime\b/i.test(typeof keyword==='string'?keyword:keyword.name||''))&&!(genres.includes(16)&&(countries.includes('JP')||language==='ja'));
}
export function normalizeSeries(row){
 const genreIds=row.genre_ids||row.genres?.map(genre=>genre.id)||[];
 return {id:row.id,categoria:'series',titulo:row.name||row.original_name||'Sem título',sinopse:row.overview||'',ano:(row.first_air_date||'').slice(0,4),estreia:row.first_air_date||null,genreIds,generos:genreIds.map(id=>seriesGenreNames[id]).filter(Boolean),originCountries:row.origin_country||[],originalLanguage:row.original_language||'',tmdbRating:row.vote_average??null,tmdbVoteCount:row.vote_count||0,nota:row.vote_count>0&&Number.isFinite(row.vote_average)?row.vote_average/2:null,poster:`https://image.tmdb.org/t/p/w342${row.poster_path}`,posterPath:row.poster_path,backdrop:row.backdrop_path?`https://image.tmdb.org/t/p/w1280${row.backdrop_path}`:null,backdropPath:row.backdrop_path||null,numberOfSeasons:Number.isInteger(row.number_of_seasons)?row.number_of_seasons:null,keywords:row.keywords?.results||[],popularity:row.popularity||0};
}
export function seriesPreferences(reviews=[],favorites=[],metadata=[]){
 const items=new Map(metadata.filter(seriesAllowed).map(item=>[String(item.id),item])),signals=new Map(),excluded=new Set();
 for(const row of reviews){if(!/^series:[1-9]\d*$/.test(row.item_key)||!row.payload)continue;const id=row.item_key.slice(7);excluded.add(id);if(parseRating(row.payload.nota)>=SERIES_RULES.positiveRating&&items.has(id))signals.set(id,1);}
 for(const favorite of favorites){const id=String(favorite.external_id);excluded.add(id);if(items.has(id))signals.set(id,2);}
 const votes=new Map();for(const [id,weight] of signals)for(const genre of items.get(id).genreIds||[])votes.set(genre,(votes.get(genre)||0)+weight);
 return {count:signals.size,ready:signals.size>=SERIES_RULES.recommendationMinimum,excluded:[...excluded],genres:[...votes].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,3).map(([id])=>id)};
}
export function adjacentSeries(items=[],previous=[]){const ids=new Set(previous.map(item=>String(item.id)));return items.filter(seriesAllowed).filter(item=>!ids.has(String(item.id))).slice(0,SERIES_RULES.rowCount);}
export function rankSeriesActivity(rows=[],metadata=[]){
 const items=new Map(metadata.filter(seriesAllowed).map(item=>[String(item.id),item])),groups=new Map(),seen=new Set();
 for(const row of rows){const id=String(row.item_key||'').replace(/^series:/,''),key=`${row.user_id}:${id}`;if(!row.item_key?.startsWith('series:')||!items.has(id)||seen.has(key)||!Number.isFinite(parseRating(row.rating)))continue;seen.add(key);const group=groups.get(id)||{...items.get(id),reviews:0,comments:0};group.reviews++;group.comments+=Math.max(0,Number(row.comments)||0);groups.set(id,group);}
 return [...groups.values()].sort((a,b)=>(b.reviews+b.comments)-(a.reviews+a.comments)||b.reviews-a.reviews||a.id-b.id).map(item=>({...item,voidNote:`${item.reviews} avaliações · ${item.comments} comentários nas avaliações da semana`}));
}

export function monthsBefore(date,months){
 const value=new Date(`${date.slice(0,10)}T00:00:00Z`),day=value.getUTCDate();value.setUTCDate(1);value.setUTCMonth(value.getUTCMonth()-months);const last=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();value.setUTCDate(Math.min(day,last));return value.toISOString().slice(0,10);
}
export function recognizedSeries(row){const rules=SERIES_RULES.seasons;return seriesAllowed(row)&&row.vote_average>=rules.minRating&&row.vote_count>=rules.minVotes&&(row.vote_count>=rules.recognizedVotes||row.popularity>=rules.minPopularity);}
export function recentSeasons(rows,today=new Date().toISOString().slice(0,10),months=6){
 const since=monthsBefore(today,months),unique=new Map();
 for(const row of rows){
  if(!recognizedSeries(row))continue;
  const season=(row.seasons||[]).filter(season=>season.season_number>=SERIES_RULES.seasons.minSeason&&Number.isInteger(season.season_number)&&season.episode_count>0&&/^\d{4}-\d{2}-\d{2}$/.test(season.air_date||'')&&season.air_date>=since&&season.air_date<=today).sort((a,b)=>b.air_date.localeCompare(a.air_date)||b.season_number-a.season_number)[0];
  if(!season)continue;
  const age=(Date.parse(today)-Date.parse(season.air_date))/86400000,score=0.45*Math.exp(-age/120)+0.25*Math.min(Math.log10(row.vote_count+1)/5,1)+0.2*(row.vote_average/10)+0.1*Math.min(Math.log10((row.popularity||0)+1)/3,1);
  unique.set(String(row.id),{...normalizeSeries(row),seasonNumber:season.season_number,seasonStartDate:season.air_date,seasonPosterPath:season.poster_path||null,seasonPoster:season.poster_path?`https://image.tmdb.org/t/p/w342${season.poster_path}`:null,seasonScore:score});
 }
 return [...unique.values()].sort((a,b)=>b.seasonScore-a.seasonScore||b.seasonStartDate.localeCompare(a.seasonStartDate)||a.id-b.id);
}
// Historical reviews remain eligible; recent writes and recent discussion get more weight.
export function rankSeriesSignals(rows=[],metadata=[],now=Date.now()){
 const items=new Map(metadata.filter(seriesAllowed).map(item=>[String(item.id),item])),groups=new Map(),seen=new Set();
 for(const row of rows){
  if(!/^series:[1-9]\d*$/.test(row.item_key||'')||!Number.isFinite(parseRating(row.rating)))continue;
  const id=row.item_key.slice(7),key=`${row.user_id}:${id}`;if(!items.has(id)||seen.has(key))continue;seen.add(key);
  const group=groups.get(id)||{...items.get(id),reviews:0,comments:0,activityScore:0};
  const time=Date.parse(row.updated_at||row.created_at),age=Number.isFinite(time)?Math.max(0,(now-time)/86400000):Infinity,comments=Math.max(0,Number(row.comments)||0);
  group.reviews++;group.comments+=comments;group.activityScore+=1+4*Math.exp(-age/14)+Math.log1p(comments)*2;groups.set(id,group);
 }
 return [...groups.values()].sort((a,b)=>b.activityScore-a.activityScore||a.id-b.id).map(item=>({...item,voidNote:`${item.reviews} ${item.reviews===1?'avaliação':'avaliações'} no Void${item.comments?` · ${item.comments} comentários nas avaliações recentes`:''}`}));
}
export function mixSeriesTrends(catalog=[],activity=[],limit=SERIES_RULES.rowCount){
 const combined=new Map();for(const item of [...catalog,...activity])if(seriesAllowed(item))combined.set(String(item.id),{...combined.get(String(item.id)),...item});
 const order=new Map(catalog.map((item,index)=>[String(item.id),index]));
 const ranked=[...combined.values()].sort((a,b)=>trendScore(b)-trendScore(a)||a.id-b.id);
 function trendScore(item){return (item.activityScore?2+Math.log1p(item.activityScore):0)+(order.has(String(item.id))?1/(1+order.get(String(item.id))/5):0)+0.12*Math.log1p(item.popularity||0);}
 return ranked.slice(0,limit);
}
