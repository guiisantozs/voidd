import {parseRating} from './ratings.js';
import {steamCoverArtwork} from './game-cover-client.js';
export const shareFormats={story:{label:'Stories',width:1080,height:1920},feed:{label:'Feed',width:1080,height:1350},square:{label:'Quadrado',width:1080,height:1080},og:{label:'Prévia',width:1200,height:630}};
export const shareTemplates={poster:'Pôster',minimal:'Minimal'};
export const SHARE_PREFERENCE='void:review-share:auto:v1';
export function reviewShareId(owner,itemKey){const id=String(itemKey||'').replace(/^filmes:/,'').replace(/^jogos:/,'jogos_');const value=owner+'_'+id;return parseShareId(value)?value:null;}
export function parseShareId(id){if(typeof id!=='string')return null;const m=id.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})_(jogos_)?([1-9][0-9]{0,9})$/i);return m?m[2]?{owner:m[1].toLowerCase(),game:m[3],itemKey:'jogos:'+m[3]}:{owner:m[1].toLowerCase(),movie:m[3],itemKey:'filmes:'+m[3]}:null;}
export function shareOptions(query={}){
 const {format='feed',template='poster',excerpt='1',author='1',info='0'}=query;
 if(!Object.hasOwn(shareFormats,format)||!Object.hasOwn(shareTemplates,template)||![excerpt,author,info].every(v=>typeof v==='string'&&['0','1'].includes(v))||[format,template].some(v=>typeof v!=='string'))throw Error('INVALID');
 if(Object.keys(query).some(k=>!['id','format','template','excerpt','author','info','v'].includes(k)))throw Error('INVALID');
 return {format,template,excerpt:excerpt==='1',author:author==='1',info:info==='1'};
}
export function shareText(value,limit){const text=String(value??'').normalize('NFC').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();const units=[...new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(text)].map(v=>v.segment);return units.length>limit?units.slice(0,limit-1).join('')+'…':text;}
export function sharePosterUrl(value,media='filmes'){try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash)return null;
 if(media==='jogos')return (u.hostname==='images.igdb.com'&&/^\/igdb\/image\/upload\/t_cover_big(?:_2x)?\/[-a-zA-Z0-9_]+\.jpg$/.test(u.pathname))||(u.hostname==='media.rawg.io'&&/^\/media\/(games|screenshots)\/[a-zA-Z0-9/_-]+\.(jpg|png|webp)$/.test(u.pathname))||!!steamCoverArtwork(u.href)?u.href:null;
 if(media!=='filmes'||u.hostname!=='image.tmdb.org'||!/^\/t\/p\/(?:w[0-9]+|original)\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(u.pathname))return null;return 'https://image.tmdb.org'+u.pathname.replace(/\/(?:w[0-9]+|original)\//,'/w780/');}catch{return null;}}
export function shareModel(row,profile,id){
 const payload=row?.payload,item=payload?.item,score=parseRating(payload?.nota);
 if(!item||!['filmes','jogos'].includes(item.categoria)||!Number.isFinite(score)||!item.titulo)throw Error('NOT_FOUND');
 return {id,media:item.categoria,externalId:String(item.id),title:shareText(item.titulo,180),year:shareText(item.ano||'',12),poster:item.categoria==='filmes'?sharePosterUrl(item.poster):null,rating:score,excerpt:payload.spoiler?'Avaliação com spoiler. Veja no VOID':shareText(payload.texto,140),spoiler:!!payload.spoiler,displayName:shareText(profile.display_name||'Pessoa do Void',50),username:shareText(profile.username||'',20),updatedAt:row.updated_at,isPublic:payload.public===true&&profile.visibility==='public'};
}
export const shareImagePath=(id,options={})=>'/api/review-share/'+id+'?'+new URLSearchParams({format:options.format||'feed',template:options.template||'poster',excerpt:options.excerpt===false?'0':'1',author:options.author===false?'0':'1'}).toString();
export function autoShareEnabled(storage){try{return storage.getItem(SHARE_PREFERENCE)!=='off';}catch{return true;}}
