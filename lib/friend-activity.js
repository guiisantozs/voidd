export const FRIEND_PAGE_SIZE=8;
export async function loadFriendActivity(client,{latest=false,cursor=null,signal}={}) {
  let request=client.rpc('void_friend_activity',{latest,before_time:cursor?.time||null,before_user:cursor?.user||null,before_item:cursor?.item||null});
  if(signal)request=request.abortSignal(signal);
  const {data,error}=await request;if(error)throw error;
  return {rows:data?.rows||[],has_more:!!data?.has_more,cursor:data?.cursor||null};
}
export function filteredFriends(people,latest,query='',order='recent') {
  const term=query.trim().replace(/^@/,'').toLocaleLowerCase('pt-BR');
  const name=p=>String(p.display_name||'').toLocaleLowerCase('pt-BR');
  return people.filter(p=>name(p).includes(term)||(p.username||'').includes(term)).sort((a,b)=>{
    const recent=order==='recent'?(Date.parse(latest[b.user_id]?.updated_at)||0)-(Date.parse(latest[a.user_id]?.updated_at)||0):0;
    return recent||name(a).localeCompare(name(b),'pt-BR')||a.user_id.localeCompare(b.user_id);
  });
}

// Tiny review thumbnails should not download a full catalog poster.
export function friendPoster(source) {
 if(typeof source!=='string')return '';
 try {
  const url=new URL(source);
  if(url.protocol==='https:'&&url.hostname==='image.tmdb.org'&&/^\/t\/p\/(original|w[0-9]+)\//.test(url.pathname)) {
   url.pathname=url.pathname.replace(/^\/t\/p\/(original|w[0-9]+)\//,'/t/p/w92/');
   return url.href;
  }
 } catch {}
 return source;
}
