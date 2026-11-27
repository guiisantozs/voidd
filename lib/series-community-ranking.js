import {parseRating} from './ratings.js';

// Rank only genuine, recent review activity. Rating value never boosts rank.
export function rankRecentSeriesReviews(rows,{now=Date.now(),days=7,limit=18,media='series'}={}) {
  const groups=new Map(),seen=new Set(),since=now-days*86400000;
  for(const row of rows) {
    if(!(row.item_key||'').startsWith(media+':')||!/^[1-9]\d*$/.test(String(row.item_key).split(':')[1]||'')||!Number.isFinite(parseRating(row.rating)))continue;
    const time=Date.parse(row.created_at||row.updated_at),key=`${row.user_id}:${row.item_key}`;
    if(!row.user_id||!Number.isFinite(time)||time<since||time>now||seen.has(key))continue;
    const id=Number(row.item_key.split(':')[1]),item=row.item;
    if(!item||Number(item.id)!==id||item.categoria!==media||row.item_key!==`${media}:${id}`)continue;
    seen.add(key);
    const group=groups.get(id)||{...item,id,reviews:0,recentReviews:0,comments:0,latestActivity:0};
    group.reviews++;if(time>=now-2*86400000)group.recentReviews++;
    group.comments+=Math.max(0,Number(row.comments)||0);group.latestActivity=Math.max(group.latestActivity,time);groups.set(id,group);
  }
  return [...groups.values()].sort((a,b)=>b.reviews-a.reviews||b.recentReviews-a.recentReviews||b.comments-a.comments||b.latestActivity-a.latestActivity||a.id-b.id).slice(0,limit).map(item=>({...item,voidNote:`${item.reviews} ${item.reviews===1?'avaliação':'avaliações'} nos últimos ${days} dias${item.recentReviews?` · ${item.recentReviews} nas últimas 48 h`:''}`}));
}
