import {loadReviewsFeed} from './reviews-feed.js';
import {withIdentities} from './usernames.js';
import {groupFriendMovies} from './friend-movie-cards.js';
import {normalizeReview,parseRating} from './ratings.js';
import {seriesPreferences} from './series-model.js';
import {SERIES_RULES} from '../config/series.js';
import {publicCatalog} from './public-catalog-client.js';
import {rankRecentSeriesReviews} from './series-community-ranking.js';
export async function seriesMetadataClient(ids,signal,fetcher=fetch,{allowPartial=false,media='series'}={}){
 const unique=[...new Set(ids.map(String))],items=[];
 for(let offset=0;offset<unique.length;offset+=20){
  const path=`/api/${media}/metadata?`+new URLSearchParams({ids:unique.slice(offset,offset+20).join(',')});
  let data;
  if(fetcher===fetch)data=await publicCatalog.request(path,{signal});
  else{const response=await fetcher(path,{signal});data=await response.json();if(!response.ok)throw Error('METADATA_UNAVAILABLE');}
  if(data.partial&&!allowPartial)throw Error('METADATA_UNAVAILABLE');items.push(...data.items);
 }
 return items;
}
export async function seriesRecommendations(client,owner,signal){
 const reviews=[];
 for(let offset=0;;offset+=500){const {data,error}=await client.from('void_records').select('item_key,payload').eq('user_id',owner).eq('kind','review').like('item_key','series:%').not('payload','is',null).order('item_key').range(offset,offset+499).abortSignal(signal);if(error)throw error;reviews.push(...data.map(row=>({...row,payload:normalizeReview(row.payload)})));if(data.length<500)break;}
 const favorites=await client.from('profile_favorites').select('external_id').eq('user_id',owner).eq('media_type','series').order('slot').abortSignal(signal);if(favorites.error)throw favorites.error;
 const positive=reviews.filter(row=>parseRating(row.payload?.nota)>=SERIES_RULES.positiveRating),ids=[...positive.map(row=>row.item_key.slice(7)),...favorites.data.map(row=>row.external_id)];
 if(new Set(ids.map(String)).size<SERIES_RULES.recommendationMinimum)return {movies:[],insufficient:true};
 const metadata=await seriesMetadataClient(ids,signal),preferences=seriesPreferences(reviews,favorites.data,metadata);
 if(!preferences.ready||!preferences.genres.length)return {movies:[],insufficient:true};
 const response=await fetch('/api/series/recommended?'+new URLSearchParams({genres:preferences.genres.join('|')}),{signal}),data=await response.json();if(!response.ok)throw Error('RECOMMENDATIONS_UNAVAILABLE');
 return {movies:data.movies.filter(item=>!preferences.excluded.includes(String(item.id))).map(item=>({...item,recommendationReason:'Inspirada nas suas avaliações e favoritas'}))};
}
export async function seriesFriends(client,owner,signal,media='series'){
 const follows=[];for(let offset=0;;offset+=500){const {data,error}=await client.from('follows').select('followed_id').eq('follower_id',owner).order('followed_id').range(offset,offset+499).abortSignal(signal);if(error)throw error;follows.push(...data.map(row=>row.followed_id));if(data.length<500)break;}
 if(!follows.length)return {movies:[]};
 let rows=[];const since=new Date(Date.now()-30*86400000).toISOString();
 for(let offset=0;offset<follows.length;offset+=50){const {data,error}=await client.from('void_records').select('user_id,item_key,updated_at,payload').eq('kind','review').eq('is_public',true).like('item_key',`${media}:%`).in('user_id',follows.slice(offset,offset+50)).gte('updated_at',since).order('updated_at',{ascending:false}).order('item_key').limit(60).abortSignal(signal);if(error)throw error;rows.push(...data.map(row=>({...row,rating:parseRating(normalizeReview(row.payload)?.nota),text:row.payload?.texto||'',spoiler:!!row.payload?.spoiler})));}
 rows=rows.filter(row=>Number.isFinite(row.rating)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,60);
 const ids=[...new Set(rows.map(row=>row.item_key.split(':')[1]))].slice(0,18),metadata=media==='animes'?[...new Map(rows.filter(row=>row.payload?.item?.categoria==='animes').map(row=>[String(row.payload.item.id),row.payload.item])).values()].filter(item=>ids.includes(String(item.id))):await seriesMetadataClient(ids,signal),identified=[];
 for(let offset=0;offset<rows.length;offset+=50)identified.push(...await withIdentities(client,rows.slice(offset,offset+50).map(({payload,...row})=>row)));
 return {movies:groupFriendMovies(metadata,identified,media)};
}
export async function seriesCommunity(client,signal,media='series'){
 const rows=[];let cursor=null,limited=false,anchor=new Date().toISOString();
 for(let page=0;page<SERIES_RULES.communityMaxPages;page++){
  const result=await loadReviewsFeed(client,{media,filters:{period:'week',sort:'recent'},cursor,anchor,signal});rows.push(...result.rows);cursor=result.cursor;anchor=result.anchor||anchor;if(!cursor)break;limited ||= page===SERIES_RULES.communityMaxPages-1;
 }
 return {movies:rankRecentSeriesReviews(rows,{now:Date.parse(anchor),days:SERIES_RULES.communityDays,media}),limited};
}
