export const CONNECTIONS_EVENT='void:connections-changed';
export const friendTabs=[['amigos','Amigos'],['seguidores','Seguidores'],['seguindo','Seguindo'],['convites','Convites']];
export const friendTab=value=>friendTabs.some(([key])=>key===value)?value:'amigos';

export function connectionLists(owner,friendships=[],follows=[],people={}) {
  const own=friendships.filter(row=>row.sender===owner||row.recipient===owner);
  const outgoing=new Set(follows.filter(row=>row.follower_id===owner).map(row=>row.followed_id));
  const incoming=new Set(follows.filter(row=>row.followed_id===owner).map(row=>row.follower_id));
  const accepted=new Map(own.filter(row=>row.status==='accepted').map(row=>[row.sender===owner?row.recipient:row.sender,row]));
  const person=id=>({...people[id],user_id:id,display_name:people[id]?.display_name||'Pessoa do Void',following:outgoing.has(id),mutual:outgoing.has(id)&&incoming.has(id),friendship:accepted.get(id)});
  const sorted=ids=>[...ids].filter(id=>id!==owner).map(person).sort((a,b)=>a.display_name.localeCompare(b.display_name,'pt-BR'));
  const friends=new Set([...accepted.keys(),...[...outgoing].filter(id=>incoming.has(id))]);
  const invites=own.filter(row=>row.status==='pending').map(row=>({...person(row.sender===owner?row.recipient:row.sender),connection:row,created_at:row.created_at}));
  const received=invites.filter(row=>row.connection.recipient===owner),sent=invites.filter(row=>row.connection.sender===owner);
  return {amigos:sorted(friends),seguidores:sorted(incoming),seguindo:sorted(outgoing),received,sent,
    counts:{amigos:friends.size,seguidores:incoming.size,seguindo:outgoing.size,convites:received.length}};
}

const relativeTime=new Intl.RelativeTimeFormat('pt-BR',{numeric:'always'});
export function connectionTime(value,now=Date.now()) {
  if(!value)return 'Data não informada';
  const date=new Date(value).getTime();if(!Number.isFinite(date))return 'Data não informada';
  const seconds=Math.max(0,(now-date)/1000);
  if(seconds<60)return 'agora';
  const [unit,size]=seconds<3600?['minute',60]:seconds<86400?['hour',3600]:seconds<2592000?['day',86400]:seconds<31536000?['month',2592000]:['year',31536000];
  return relativeTime.format(-Math.floor(seconds/size),unit);
}

async function allRows(makeRequest,signal) {
  const rows=[];
  for(let offset=0;;offset+=500){let request=makeRequest().range(offset,offset+499);if(signal)request=request.abortSignal(signal);const {data,error}=await request;if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)return rows;}
}
export async function loadConnections(client,owner,signal) {
  const [friendships,follows]=await Promise.all([
    allRows(()=>client.from('void_friendships').select('sender,recipient,status,created_at').or(`sender.eq.${owner},recipient.eq.${owner}`).order('created_at',{ascending:false}).order('sender').order('recipient'),signal),
    allRows(()=>client.from('follows').select('follower_id,followed_id,created_at').or(`follower_id.eq.${owner},followed_id.eq.${owner}`).order('follower_id').order('followed_id'),signal),
  ]);
  const ids=[...new Set([owner,...friendships.flatMap(row=>[row.sender,row.recipient]),...follows.flatMap(row=>[row.follower_id,row.followed_id])])];
  const people={};
  // Bound concurrency to three identity batches, avoiding one network round-trip per batch in series.
  for(let offset=0;offset<ids.length;offset+=150){
    const batches=[0,50,100].map(start=>ids.slice(offset+start,offset+start+50)).filter(batch=>batch.length);
    const results=await Promise.all(batches.map(async batch=>{let request=client.rpc('void_identities',{ids:batch});if(signal)request=request.abortSignal(signal);const {data,error}=await request;if(error)throw error;return data||[];}));
    for(const batch of results)for(const person of batch)people[person.user_id]=person;
  }
  return {friendships,follows,people,...connectionLists(owner,friendships,follows,people)};
}

async function checked(request){const {error}=await request;if(error)throw error;}
export async function changeInvitation(client,owner,person,action) {
  const row=person.connection;
  if(!row||row.status!=='pending'||!['accept','decline','cancel'].includes(action))throw Error('INVALID_INVITE');
  if(action==='cancel'?row.sender!==owner:row.recipient!==owner)throw Error('INVALID_INVITE');
  let request=action==='accept'?client.from('void_friendships').update({status:'accepted'}):client.from('void_friendships').delete();
  const {data,error}=await request.eq('sender',row.sender).eq('recipient',row.recipient).eq('status','pending').select('sender');
  if(error)throw error;
  if(!data?.length)throw Error('STALE_INVITE');
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(CONNECTIONS_EVENT,{detail:{user_id:owner,silent:true}}));
}
export async function removeFriend(client,owner,person) {
  // Accepted invitations and mutual follows both confer friendship. Only the
  // caller's follow is removed; the other person's follower relationship stays.
  if(person.friendship){const row=person.friendship;if(![row.sender,row.recipient].includes(owner)||(row.sender===owner?row.recipient:row.sender)!==person.user_id)throw Error('INVALID_INVITE');await checked(client.from('void_friendships').delete().eq('sender',row.sender).eq('recipient',row.recipient).eq('status','accepted'));}
  if(person.mutual)await checked(client.from('follows').delete().eq('follower_id',owner).eq('followed_id',person.user_id));
}
export function connectionError(error) {
  if(error?.message==='STALE_INVITE')return 'Esse convite já foi atualizado. Confira a lista novamente.';
  if(error?.code==='23505')return 'Já existe uma conexão ou convite entre vocês. A lista foi atualizada.';
  if(error?.message?.includes('RATE_LIMIT')||error?.code==='P0001')return 'Muitas ações em pouco tempo. Aguarde um minuto e tente novamente.';
  return 'Não foi possível concluir essa ação. Confira sua conexão e tente novamente.';
}
