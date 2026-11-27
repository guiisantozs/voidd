import { normalizeUsername,usernameValid } from './usernames.js';
export const INVITE_KEY='void:pending-friend-invite:v1';
export const INVITE_TTL=7*86400000;
export function readInvite(storage,now=Date.now()) {
  try{
    const value=JSON.parse(storage.getItem(INVITE_KEY)||'null');
    if(!value)return null;
    if(!usernameValid(value.handle)||!Number.isFinite(value.createdAt)||value.createdAt>now||now-value.createdAt>=INVITE_TTL){storage.removeItem(INVITE_KEY);return null;}
    return value;
  }catch{return null;}
}
export function rememberInvite(storage,handle,now=Date.now()) {
  handle=normalizeUsername(handle);if(!usernameValid(handle))throw Error('INVALID_INVITE');
  const existing=readInvite(storage,now);
  const value=existing?.handle===handle?existing:{handle,createdAt:now};
  storage.setItem(INVITE_KEY,JSON.stringify(value));return value;
}
export function claimInvite(storage,owner,now=Date.now()) {
  const value=readInvite(storage,now);if(!value||!owner||value.owner&&value.owner!==owner)return null;
  const claimed={...value,owner};storage.setItem(INVITE_KEY,JSON.stringify(claimed));return claimed;
}
export function clearInvite(storage,reference,now=Date.now()) {
  const current=readInvite(storage,now);
  if(current?.handle===reference.handle&&current?.createdAt===reference.createdAt&&current?.owner===reference.owner)storage.removeItem(INVITE_KEY);
}
export async function requestFriend(client,handle) {
  const normalized=normalizeUsername(handle);if(!usernameValid(normalized))throw Error('INVALID_INVITE');
  const {data,error}=await client.rpc('void_request_friend',{handle:normalized});if(error)throw error;
  if(!['sent','received','friends','self','missing'].includes(data))throw Error('INVALID_RESPONSE');return data;
}
export const inviteMessage=status=>({sent:'Convite enviado! A outra pessoa ainda precisa aceitar.',received:'Você já recebeu um convite dessa pessoa. Confira a aba Convites.',friends:'Vocês já são amigos.',self:'Este é seu próprio convite. Compartilhe com outra pessoa.',missing:'Esse @ não está mais disponível.'}[status]||'');
export function personalInviteUrl(origin,handle) {
  if(!usernameValid(handle))return '';
  const url=new URL(origin);if(!['https:','http:'].includes(url.protocol))return '';
  return `${url.origin}/convite/${encodeURIComponent(handle)}`;
}
