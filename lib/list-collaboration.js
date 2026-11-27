import {listItemKey} from './lists.js';
import {parseRating} from './ratings.js';

export async function collaborationRpc(client,name,args={}){
  const {data,error}=await client.rpc(name,args);if(error)throw error;return data;
}
export function collaborationSummary(items=[],social={}){
  const people=(social.participants||[]).filter(p=>p.status==='accepted');
  const reviews=new Map((social.reviews||[]).map(r=>[`${r.user_id}/${r.item_key}`,r]));
  const progress=new Set((social.progress||[]).map(p=>`${p.user_id}/${listItemKey(p)}`));
  let done=0,unanimous=0;
  const perPerson=people.map(p=>({...p,completed:0}));
  const works=items.map(entry=>{
    const key=listItemKey(entry),participants=perPerson.map(p=>{
      const review=reviews.get(`${p.user_id}/${key}`),rating=parseRating(review?.rating);
      const completed=progress.has(`${p.user_id}/${key}`)||Number.isFinite(rating);
      if(completed){done++;p.completed++;}
      return {...p,completed,rating:Number.isFinite(rating)?rating:null,manual:progress.has(`${p.user_id}/${key}`)};
    });
    const watched=participants.filter(p=>p.completed).length,ratings=participants.filter(p=>p.rating!==null);
    if(people.length&&watched===people.length)unanimous++;
    return {key,participants,watched,total:people.length,average:ratings.length?ratings.reduce((n,p)=>n+p.rating,0)/ratings.length:null,ratingCount:ratings.length};
  });
  const total=items.length*people.length;
  return {works,people:perPerson,total,done,percent:total?Math.round(done/total*100):0,unanimous};
}
