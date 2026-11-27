import { parseRating } from './ratings.js';
export const REVIEW_FEED_MEDIA = { anime:{key:'animes',label:'animes',path:'/animes/avaliacoes'}, movie: { key:'filmes', label:'filmes', path:'/avaliacoes' }, game: { key:'jogos', label:'jogos', path:'/jogos/avaliacoes' }, series: { key:'series', label:'séries', path:'/series/avaliacoes' } };
export const FEED_DEFAULTS = { tab:'comunidade',period:'month',minRating:'0',maxRating:'5',platform:'',genre:'',status:'',text:'all',sort:'recent',q:'' };
const choices={tab:['comunidade','amigos'],period:['today','week','month','all'],platform:['','pc','playstation','xbox','nintendo'],genre:['','action','adventure','role-playing-games-rpg','strategy','shooter','puzzle','racing','sports','indie'],status:['','finished','platinum','playing','abandoned'],text:['all','with','ratings'],sort:['recent','likes','highest','lowest','comments']};
export function normalizeFeedFilters(query={}) {
 const result={...FEED_DEFAULTS};for(const [key,values] of Object.entries(choices))if(typeof query[key]==='string'&&values.includes(query[key]))result[key]=query[key];
 for(const key of ['minRating','maxRating']){const value=typeof query[key]==='string'?parseRating(query[key]):null;if(Number.isFinite(value))result[key]=String(value);}
 if(Number(result.minRating)>Number(result.maxRating))[result.minRating,result.maxRating]=[result.maxRating,result.minRating];
 if(typeof query.q==='string')result.q=query.q.replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,100);
 return result;
}
export function feedFilterQuery(filters) { return Object.fromEntries(Object.entries(normalizeFeedFilters(filters)).filter(([key,value])=>value!==FEED_DEFAULTS[key])); }
export function activeFeedFilters(filters){return Object.entries(feedFilterQuery(filters)).filter(([key])=>!['tab','sort'].includes(key));}
export async function loadReviewsFeed(client,{media='jogos',filters,cursor=null,anchor=new Date().toISOString(),seenAt=null,signal}={}){
 if(!client||!['filmes','jogos','series','animes','livros'].includes(media))throw Error('INVALID_FEED');
 let request=client.rpc('void_reviews_feed',{media,filters:normalizeFeedFilters(filters),after_cursor:cursor,as_of:anchor,seen_at:seenAt});if(signal)request=request.abortSignal(signal);
 const {data,error}=await request;if(error)throw error;return {...data,rows:data?.rows||[],top_games:data?.top_games||[],friends_playing:data?.friends_playing||[]};
}
export function mergeFeedRows(before,after){return [...new Map([...before,...after].map(row=>[row.user_id+':'+row.item_key,row])).values()];}
export const FEED_STATUS={finished:{label:'Finalizou',color:'var(--status-finished,#ad7fe8)'},platinum:{label:'Platinou',color:'var(--status-platinum,#e5c05f)'},playing:{label:'Jogando',color:'var(--status-playing,#3ddc84)'},playing_now:{label:'Jogando agora',color:'var(--status-playing,#3ddc84)'},abandoned:{label:'Abandonou',color:'var(--status-abandoned,#e5484d)'},want:{label:'Quero jogar',color:'var(--status-want,#4c8dff)'},paused:{label:'Pausado',color:'var(--status-paused,#f5b83d)'}};
export function reviewFeedContext(context={},status='',now=new Date()){
 const shared=context?.share_status===true,valid=Object.hasOwn(FEED_STATUS,status);
 return {share_status:shared,platform:typeof context?.platform==='string'?context.platform.trim().slice(0,60):'',status:shared&&valid?status:null,marked_at:shared&&valid?now.toISOString():null};
}
export function feedVisitKey(owner,tab,media='jogos'){return `void:reviews-visit:${media}:${owner||'guest'}:${tab==='amigos'?'amigos':'comunidade'}`;}
