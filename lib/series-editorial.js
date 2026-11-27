import {seriesAllowed,normalizeSeries} from './series-model.js';
import {releaseDay,validReleaseDate} from './movie-release.js';
import {selectEpisodeHighlights} from './episode-releases.js';

export const SERIES_EDITORIAL_RULES={cacheMs:6*3600000,staleMs:24*3600000,candidateLimit:30,heroCount:5,trendingCount:18,weeklyCount:5,minVotes:200,minRating:6.5,heroVotes:800,heroRating:7,weeklyVotes:1000,weeklyRating:7.8,episodeVotes:1000,minPopularity:10};
const genres=row=>row.genre_ids||row.genres?.map(genre=>genre.id)||[];
export function editorialSeriesAllowed(row,today) {
  return seriesAllowed(row)&&Number.isSafeInteger(row.id)&&row.id>0&&validReleaseDate(row.first_air_date)&&row.first_air_date<=today&&row.vote_count>=SERIES_EDITORIAL_RULES.minVotes&&row.vote_average>=SERIES_EDITORIAL_RULES.minRating&&!genres(row).some(id=>[10763,10764,10766,10767].includes(id));
}
function interest(row) {return 2/(1+(row.dayRank??100)/5)+1.6/(1+(row.weekRank??100)/8);}
function recency(row,today) {const date=row.last_episode_to_air?.air_date;if(!validReleaseDate(date)||date>today)return 0;return Math.exp(-Math.max(0,(Date.parse(today)-Date.parse(date))/86400000)/30);}
function quality(row) {const votes=Math.max(0,row.vote_count),weight=votes/(votes+1000);return weight*row.vote_average+(1-weight)*7;}
const ordered=(rows,score)=>[...rows].sort((a,b)=>score(b)-score(a)||a.id-b.id);
export function selectGlobalHero(rows,today) {
  return ordered(rows.filter(row=>row.backdrop_path&&row.vote_count>=SERIES_EDITORIAL_RULES.heroVotes&&row.vote_average>=SERIES_EDITORIAL_RULES.heroRating&&row.popularity>=SERIES_EDITORIAL_RULES.minPopularity),row=>interest(row)+.6*recency(row,today)+.12*Math.log1p(row.popularity||0)+.1*quality(row)).slice(0,SERIES_EDITORIAL_RULES.heroCount);
}
export function selectGlobalTrending(rows,excluded,today) {
  return ordered(rows.filter(row=>!excluded.has(row.id)),row=>2/(1+(row.weekRank??100)/6)+1/(1+(row.dayRank??100)/6)+.4*recency(row,today)).slice(0,SERIES_EDITORIAL_RULES.trendingCount);
}
export function selectGlobalWeekly(rows,excluded,today) {
  return ordered(rows.filter(row=>!excluded.has(row.id)&&row.backdrop_path&&row.vote_count>=SERIES_EDITORIAL_RULES.weeklyVotes&&row.vote_average>=SERIES_EDITORIAL_RULES.weeklyRating),row=>quality(row)+.6*interest(row)+.5*recency(row,today)).slice(0,SERIES_EDITORIAL_RULES.weeklyCount);
}
function episodeFrom(row) {
  const episode=row.last_episode_to_air;
  return episode?{id:episode.id,seriesId:row.id,seasonNumber:episode.season_number,episodeNumber:episode.episode_number,episodeType:episode.episode_type||null,name:episode.name||`Episódio ${episode.episode_number}`,airDate:episode.air_date||null,still:episode.still_path?`https://image.tmdb.org/t/p/w300${episode.still_path}`:null}:null;
}
export function distributeSeriesEditorial(rows,now=new Date()) {
  const today=releaseDay(now),allowed=rows.filter(row=>editorialSeriesAllowed(row,today));
  const hero=selectGlobalHero(allowed,today),used=new Set(hero.map(row=>row.id));
  const trending=selectGlobalTrending(allowed,used,today);trending.forEach(row=>used.add(row.id));
  const weekly=selectGlobalWeekly(allowed,used,today);
  // Reserve qualified weekly alternatives when the trend row would otherwise
  // consume the entire pool. Hero always keeps first priority.
  if(weekly.length<SERIES_EDITORIAL_RULES.weeklyCount) {
    const alternatives=selectGlobalWeekly(allowed,new Set(hero.map(row=>row.id)),today).filter(row=>trending.some(item=>item.id===row.id)).slice(0,SERIES_EDITORIAL_RULES.weeklyCount-weekly.length);
    for(const row of alternatives){trending.splice(trending.findIndex(item=>item.id===row.id),1);weekly.push(row);}
  }
  const highlights=selectEpisodeHighlights(allowed.filter(row=>row.vote_count>=SERIES_EDITORIAL_RULES.episodeVotes&&row.popularity>=SERIES_EDITORIAL_RULES.minPopularity).map(row=>({series:normalizeSeries(row),episode:episodeFrom(row),relevance:interest(row)})),{now});
  return {hero:hero.map(normalizeSeries),trending:trending.map(normalizeSeries),weekly:weekly.map(normalizeSeries),...highlights};
}
// One public editorial edition per server module. Private activity never enters
// this cache. The same resource cache is reused by metadata/detail consumers.
export function createSeriesEditorial({resource,clock=Date.now}={}) {
  let snapshot=null,pending=null,retryAt=0,lastError=null;
  const answer=(row,stale=false)=>({...row.selection,...selectEpisodeHighlights(row.selection.episodes,{now:new Date(clock())}),generatedAt:new Date(row.at).toISOString(),expiresAt:new Date(row.expires).toISOString(),partial:row.partial||stale,stale});
  async function load() {
    const sources=await Promise.allSettled([resource('trending/tv/day',{page:1},SERIES_EDITORIAL_RULES.cacheMs),resource('trending/tv/week',{page:1},SERIES_EDITORIAL_RULES.cacheMs),resource('trending/tv/week',{page:2},SERIES_EDITORIAL_RULES.cacheMs)]);
    if(sources.every(row=>row.status==='rejected'))throw sources[0].reason;
    const candidates=new Map(),today=releaseDay(new Date(clock()));let partial=sources.some(row=>row.status==='rejected');
    for(let source=0;source<sources.length;source++) {
      if(sources[source].status!=='fulfilled')continue;
      const data=sources[source].value;if(!Array.isArray(data.results))throw Error('EDITORIAL_INVALID');
      for(const [index,row] of data.results.entries()) {
        if(!editorialSeriesAllowed(row,today))continue;
        const ranks=candidates.get(row.id)||{...row};
        if(source===0)ranks.dayRank=index;
        else ranks.weekRank=Math.min(ranks.weekRank??100,index+(source-1)*20);
        candidates.set(row.id,ranks);
      }
    }
    const selected=ordered([...candidates.values()],interest).slice(0,SERIES_EDITORIAL_RULES.candidateLimit),rows=[];
    for(let offset=0;offset<selected.length;offset+=4) {
      const details=await Promise.allSettled(selected.slice(offset,offset+4).map(row=>resource(`tv/${row.id}`,{append_to_response:'keywords'},SERIES_EDITORIAL_RULES.cacheMs)));
      for(let index=0;index<details.length;index++) {
        const result=details[index],seed=selected[offset+index];
        if(result.status==='rejected'){partial=true;continue;}
        if(result.value.id!==seed.id){partial=true;continue;}
        rows.push({...result.value,dayRank:seed.dayRank,weekRank:seed.weekRank});
      }
    }
    if(selected.length&&!rows.length)throw Error('EDITORIAL_UNAVAILABLE');
    const at=clock(),next={selection:distributeSeriesEditorial(rows,new Date(at)),at,expires:at+(partial?60000:SERIES_EDITORIAL_RULES.cacheMs),partial};
    if(partial&&snapshot&&!snapshot.partial&&at-snapshot.at<SERIES_EDITORIAL_RULES.staleMs){retryAt=at+60000;return answer(snapshot,true);}
    snapshot=next;return answer(snapshot);
  }
  return {
    clear(){snapshot=null;pending=null;retryAt=0;lastError=null;},
    get() {
      const now=clock();
      if(snapshot?.expires>now)return Promise.resolve(answer(snapshot));
      if(pending)return pending;
      if(retryAt>now){if(snapshot&&now-snapshot.at<SERIES_EDITORIAL_RULES.staleMs)return Promise.resolve(answer(snapshot,true));return Promise.reject(lastError||Error('EDITORIAL_UNAVAILABLE'));}
      pending=load().catch(error=>{
        lastError=error;retryAt=clock()+Math.max(60000,(error.retryAfter||0)*1000);
        if(snapshot&&clock()-snapshot.at<SERIES_EDITORIAL_RULES.staleMs)return answer(snapshot,true);
        throw error;
      }).finally(()=>{pending=null;});return pending;
    },
  };
}
