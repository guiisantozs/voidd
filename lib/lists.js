import { favoriteSnapshot,moveFavorite,profileIdValid } from './profile.js';
export const LISTS_EVENT='void:lists-changed';
export const listMedia=[['filmes','film','Filme'],['series','monitor','Série'],['jogos','gamepad','Jogo'],['animes','play','Anime']];
export const allListMedia=listMedia.map(([key])=>key);
export const listMediaNames={filmes:'Filmes',series:'Séries',jogos:'Jogos',animes:'Animes'};
export const validListMedia=types=>Array.isArray(types)&&types.length>=1&&types.length<=4&&new Set(types).size===types.length&&types.every(type=>allListMedia.includes(type));
export const listVisibility=[['public','Pública'],['connections','Só seguidores / amigos'],['private','Privada']];
export const cleanListText=value=>String(value??'').normalize('NFC').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,'').trim();
export const listItemKey=item=>`${item.media_type||item.categoria}:${item.external_id||item.id}`;
export function listEntry(item,note='') {
  const snapshot=favoriteSnapshot(item),id=String(item.id);
  if(!listMedia.some(([key])=>key===item.categoria)||! /^[1-9][0-9]{0,14}$/.test(id)||!snapshot.titulo)throw Error('INVALID_ITEM');
  return {media_type:item.categoria,external_id:id,note:cleanListText(note),snapshot:{...snapshot,id,titulo:cleanListText(snapshot.titulo)}};
}
export function validateList(form,items) {
  const title=cleanListText(form.title),description=cleanListText(form.description);
  if(!title||title.length>80||description.length>500||!listVisibility.some(([key])=>key===form.visibility)||typeof form.ranked!=='boolean')throw Error('INVALID_LIST');
  if(form.media_types!==undefined&&!validListMedia(form.media_types))throw Error('INVALID_LIST');
  if(items!==undefined){
    if(!Array.isArray(items)||items.length>200||new Set(items.map(listItemKey)).size!==items.length)throw Error('INVALID_ITEMS');
    for(const entry of items){if(entry.note?.length>200)throw Error('INVALID_NOTE');listEntry({...entry.snapshot,id:entry.external_id,categoria:entry.media_type},entry.note);}
  }
  if(form.collaboration_enabled!==undefined&&typeof form.collaboration_enabled!=='boolean')throw Error('INVALID_LIST');
  if(form.cover_key!==undefined&&typeof form.cover_key!=='string')throw Error('INVALID_LIST');
  return {title,description,visibility:form.visibility,ranked:form.ranked,...(form.media_types!==undefined?{media_types:[...form.media_types]}:{}),...(form.collaboration_enabled!==undefined?{collaboration_enabled:form.collaboration_enabled}:{}),...(form.cover_key!==undefined?{cover_key:form.cover_key}:{})};
}
export const moveListItem=moveFavorite;
export function listError(error) {
  const message=error?.message||'';
  if(message.includes('INVITE_COOLDOWN'))return 'Aguarde sete dias antes de convidar essa pessoa novamente.';
  if(error?.code==='42501')return 'Você não tem permissão para esta ação. Atualize a lista para conferir seu acesso.';
  if(message.includes('LIST_CONFLICT'))return 'Esta lista mudou em outra janela. Reabra o editor para carregar a versão atual.';
  if(message.includes('LIST_LIMIT'))return 'Esta lista pode ter no máximo 200 obras.';
  if(message.includes('RATE_LIMIT'))return 'Você atingiu o limite de ações. Para novas listas, aguarde a próxima hora; para outras ações, um minuto.';
  if(message.includes('INVALID')||error?.code==='23514')return 'Confira os limites: título 80, descrição 500 e comentário por obra 200 caracteres.';
  if(error?.code==='23505')return 'Esta obra já está na lista. Atualize para conferir.';
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
export async function listsPage(client,{mode='mine',sort='recent',owner=null,page=0,media=null,signal}={}) {
  if(media!==null&&!allListMedia.includes(media))throw Error('INVALID_QUERY');
  if(!['mine','discover','following','saved','profile'].includes(mode)||!['recent','popular'].includes(sort)||!Number.isInteger(page)||page<0||page>10000||owner&&!profileIdValid(owner))throw Error('INVALID_QUERY');
  let request=client.rpc('void_lists_page_v2',{section:mode,ordering:sort,target:owner,page_number:page,media_filter:media});if(signal)request=request.abortSignal(signal);
  const {data,error}=await request;if(error)throw error;return data||{rows:[],has_more:false};
}
export async function readList(client,id,signal) {
  if(!profileIdValid(id))throw Error('INVALID_LIST');let request=client.rpc('void_list_detail',{target:id});if(signal)request=request.abortSignal(signal);
  const {data,error}=await request;if(error)throw error;return data;
}
export async function writeList(client,id,form,items,version=null) {
  const metadata=validateList(form,items);
  const {data,error}=await client.rpc(form.collaboration_enabled===undefined&&form.cover_key===undefined?'void_list_write':'void_list_write_v3',{target:id||null,metadata,entries:items??null,expected_version:version});if(error)throw error;return data;
}
export async function setListItem(client,id,item,present) {
  const {data,error}=await client.rpc('void_list_item_toggle',{target:id,entry:listEntry(item),present});if(error)throw error;return data;
}
export function listsChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(LISTS_EVENT));}
