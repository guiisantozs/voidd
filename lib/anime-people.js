import {animeResource,getAnimeDetail} from './anime-catalog.js';
import {animeCache,ANIME_TTL} from './anime-cache.js';
import {decodeAnimeId} from './anime-provider.js';
const photo=value=>typeof value==='string'&&value.startsWith('https://cdn.myanimelist.net/')&&!/questionmark/i.test(value)?value:null;
const positions={Director:'Direção','Episode Director':'Direção de episódio',Producer:'Produção','Executive Producer':'Produção executiva',Music:'Composição musical',Script:'Roteiro','Series Composition':'Composição da série','Original Creator':'Criação original','Sound Director':'Direção de som'};
export function normalizeAnimeSong(row){
 if(typeof row!=='string')return {title:row?.title||'',artist:row?.artist||'',episodes:String(row?.episodes||'').replace(/^eps?\.?\s*/i,'Episódios ')};
 const text=row.replace(/^#\d+:\s*/,''),match=text.match(/^"(.+)"\s+by\s+(.+?)(?:\s+\(eps?\.?\s*([^)]*)\))?$/i);
 return match?{title:match[1],artist:match[2],episodes:match[3]?'Episódios '+match[3]:''}:{title:row,artist:'',episodes:''};
}
export function normalizeAnimeCharacters(rows){return [...new Map(rows.filter(row=>row.character?.mal_id).map(row=>[row.character.mal_id,{id:row.character.mal_id,name:row.character.name,photo:photo(row.character.images?.jpg?.image_url),role:row.role==='Main'?'Principal':'Coadjuvante',main:row.role==='Main',voices:(row.voice_actors||[]).filter(v=>v.language==='Japanese'||/^Portuguese.*BR|^Portuguese \(Brazil\)/.test(v.language)).map(v=>({id:v.person.mal_id,name:v.person.name,photo:photo(v.person.images?.jpg?.image_url),language:v.language==='Japanese'?'Japonês':'Português BR'}))}])).values()].sort((a,b)=>Number(b.main)-Number(a.main));}
export function normalizeAnimeStaff(rows){const found=new Map();for(const row of rows){const person=row.person;if(!person?.name)continue;const roles=(row.positions||[]).filter(role=>positions[role]).map(role=>positions[role]);if(!roles.length)continue;const key=String(person.mal_id||person.name).toLowerCase(),old=found.get(key);found.set(key,{id:person.mal_id||key,name:person.name,photo:photo(person.images?.jpg?.image_url),roles:[...new Set([...old?.roles||[],...roles])]});}return [...found.values()];}
export function createAnimePeople({cache=animeCache,resource=animeResource,detail=getAnimeDetail}={}){return {
 characters:id=>cache.get('characters:v1:'+id,async()=>({characters:normalizeAnimeCharacters((await resource(`anime/${decodeAnimeId(id)}/characters`,{},ANIME_TTL.static)).data||[])})),
 staff:id=>cache.get('staff:v1:'+id,async()=>{const [data,item]=await Promise.all([resource(`anime/${decodeAnimeId(id)}/staff`,{},ANIME_TTL.static),detail(id)]);return {staff:normalizeAnimeStaff(data.data||[]),studios:item.studios||[],producers:item.producers||[]};}),
 music:id=>cache.get('music:v1:'+id,async()=>{const item=await detail(id);return {openings:(item.music?.openings||[]).map(normalizeAnimeSong),endings:(item.music?.endings||[]).map(normalizeAnimeSong)};})
};}
export const animePeople=createAnimePeople();
