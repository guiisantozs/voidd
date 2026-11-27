import {profileIdValid} from './profile.js';
import {profileHref,withIdentities} from './usernames.js';
import {workHref} from './work-client.js';

export const PROFILE_CONTENT_EVENT='void:profile-content';
export const profileContentChanged=()=>window.dispatchEvent(new Event(PROFILE_CONTENT_EVENT));
export function contentError(error){return error?.message?.includes('RATE_LIMIT')?'Você pode enviar até 5 recados por minuto. Aguarde um pouco.':error?.message?.includes('INVALID_HIGHLIGHT')?'Este item não está mais disponível para fixar.':'Não foi possível concluir. Confira sua conexão e tente novamente.';}
export function profileReviewHref(item,owner){return item.categoria==='filmes'?`${workHref(item)}?tab=reviews&review=${encodeURIComponent(owner)}`:workHref(item);}
export function diaryGroups(rows){
 const groups=new Map();for(const row of rows){const month=row.consumed_on.slice(0,7);if(!groups.has(month))groups.set(month,[]);groups.get(month).push(row);}
 return [...groups].map(([month,entries])=>({month,entries}));
}
export function annualActivity(year,days=[]){
 if(!Number.isInteger(year)||year<1900||year>9999)throw Error('INVALID_YEAR');
 const counts=new Map(days.map(day=>[day.day,Number(day.total)||0])),start=new Date(Date.UTC(year,0,1)),cells=Array((start.getUTCDay()+6)%7).fill(null);
 for(let day=start;day.getUTCFullYear()===year;day=new Date(day.getTime()+86400000)){const date=day.toISOString().slice(0,10);cells.push({date,total:counts.get(date)||0});}
 return cells;
}
export function activityPresentation(row){
 const data=row.data||{},item=data.item;
 if(row.type==='review')return {icon:'star',text:`Avaliou ${item?.titulo||'uma obra'}`,href:item?profileReviewHref(item,row.owner):null,item};
 if(row.type==='list_add')return {icon:'list',text:`Adicionou ${item?.titulo||'uma obra'} à lista ${data.list_title||''}`,href:data.list_id?`/listas/${data.list_id}`:'/listas/ver-depois',item};
 if(row.type==='follow')return {icon:'user',text:`Seguiu ${data.username?`@${data.username}`:'um perfil'}`,href:profileHref({user_id:data.profile_id,username:data.username})};
 if(row.type==='achievement')return {icon:'diamond',text:`Desbloqueou ${data.title||'uma conquista'}`};
 return {icon:'clock',text:data.title||'Registrou uma nova atividade'};
}
export async function profileContentPage(client,rpc,args,signal){
 if(!profileIdValid(args.target))throw Error('INVALID_PROFILE');
 let request=client.rpc(rpc,args);if(signal)request=request.abortSignal(signal);
 const {data,error}=await request;if(error)throw error;
 if(rpc==='void_profile_activity_page'){
  const follows=(data.rows||[]).filter(row=>row.type==='follow');
  // Resolve only the already-public minimal identities, not restricted profiles.
  const identities=await withIdentities(client,follows.map(row=>({user_id:row.data.profile_id})));
  const people=new Map(identities.map(person=>[person.user_id,person]));
  data.rows=data.rows.map(row=>row.type==='follow'?{...row,data:{...row.data,username:people.get(row.data.profile_id)?.username}}:row);
 }
 return data;
}
export async function profileComments(client,target,offset,signal){
 let request=client.from('profile_comments').select('*',{count:'exact'}).eq('profile_id',target).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19);
 if(signal)request=request.abortSignal(signal);const {data,count,error}=await request;if(error)throw error;
 return {rows:await withIdentities(client,data||[]),total:count||0};
}
