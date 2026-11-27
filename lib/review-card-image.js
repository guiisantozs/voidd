import {createElement as h} from 'react';
import {ImageResponse} from 'next/og.js';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {shareFormats,shareText,sharePosterUrl} from './review-share.js';
import { avatarImageUrl, avatarColor } from './avatars.js';
const emojiCache=new Map();
const posters=new Map(),images=new Map(),pending=new Map();let fontPromise,rendering=0,cacheBytes=0;
const fallbacks=['#6e43a0','#3b497e','#9a557d'];
export function dominantColors(pixels){
 const bins=new Map();for(let i=0;i<pixels.length;i+=3){const rgb=[pixels[i],pixels[i+1],pixels[i+2]],max=Math.max(...rgb),min=Math.min(...rgb);if(max<28||min>235)continue;const key=rgb.map(v=>Math.floor(v/48)).join(',');const bin=bins.get(key)||{n:0,rgb:[0,0,0],weight:0};bin.n++;bin.weight+=1+(max-min)/100;rgb.forEach((v,j)=>bin.rgb[j]+=v);bins.set(key,bin);}
 const chosen=[];for(const bin of [...bins.values()].sort((a,b)=>b.weight-a.weight)){const c=bin.rgb.map(v=>Math.round(v/bin.n));if(chosen.every(p=>Math.hypot(...c.map((v,i)=>v-p[i]))>85))chosen.push(c);if(chosen.length===3)break;}
 return [...chosen.map(rgb=>'#'+rgb.map(v=>Math.max(48,Math.min(170,Math.round(v*.72))).toString(16).padStart(2,'0')).join('')),...fallbacks].slice(0,3);
}
async function fonts(){if(!fontPromise)fontPromise=Promise.all([
 ['Poppins','@fontsource/poppins/files/poppins-latin-400-normal.woff',400],['Poppins','@fontsource/poppins/files/poppins-latin-700-normal.woff',700],['Poppins','@fontsource/poppins/files/poppins-latin-600-normal.woff',600]
].map(async([name,file,weight])=>({name,data:await readFile(join(process.cwd(),'node_modules',file)).catch(()=>null),weight,style:'normal'}))).then(items=>{const available=items.filter(font=>font.data);return available.length?available:undefined;}).catch(error=>{fontPromise=null;throw error;});return fontPromise;}
async function posterAsset(url,media='filmes'){
 url=sharePosterUrl(url,media);if(!url)return {colors:fallbacks};const cached=posters.get(url);if(cached&&cached.until>Date.now())return cached.value;
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(5500),redirect:'error'});if(!response.ok||!/^image\/(?:jpeg|png|webp)/.test(response.headers.get('content-type')||''))throw Error();
  const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4*1024*1024)throw Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const buffer=Buffer.concat(chunks),image=sharp(buffer,{limitInputPixels:16000000}).rotate();
  const [png,raw]=await Promise.all([image.clone().resize(780,1170,{fit:'inside'}).png().toBuffer(),image.clone().resize(36,54,{fit:'cover'}).removeAlpha().raw().toBuffer()]);
  const metadata=await sharp(png).metadata();const value={ratio:metadata.width/metadata.height,src:'data:image/png;base64,'+png.toString('base64'),colors:dominantColors(raw)};
  if(posters.size>=12)posters.delete(posters.keys().next().value);posters.set(url,{value,until:Date.now()+3600000});return value;
 }catch{return {colors:fallbacks};}
}
async function authorAvatarAsset(avatar){
 const url=avatarImageUrl(avatar,96);if(!url)return null;
 try{const response=await fetch(url,{signal:AbortSignal.timeout(3000),redirect:'error'});if(!response.ok||!/^image\/webp/.test(response.headers.get('content-type')||''))return null;
  const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const buffer=await sharp(Buffer.concat(chunks),{limitInputPixels:1000000}).resize(64,64,{fit:'cover'}).png().toBuffer();return 'data:image/png;base64,'+buffer.toString('base64');
 }catch{return null;}
}
// Resolve emoji as bounded, allowlisted assets before rendering. No dynamic font requests.
const isEmoji=value=>/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value);
const segments=value=>[...new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(value)].map(v=>v.segment);
const missingGlyph='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#c4a0e7" d="M16 2 20 12 30 16 20 20 16 30 12 20 2 16 12 12Z"/></svg>').toString('base64');
async function emojiAssets(model,options){
 const all=[...new Set(segments([model.title,options.excerpt&&options.template!=='minimal'?model.excerpt:'',options.author?model.displayName:''].join(' ')).filter(isEmoji))].slice(0,12),result=new Map();let next=0;
 await Promise.all(Array.from({length:Math.min(3,all.length)},async()=>{while(next<all.length){const text=all[next++];if(emojiCache.has(text)){result.set(text,emojiCache.get(text));continue;}const code=[...text].map(v=>v.codePointAt(0).toString(16)).filter(v=>v!=='fe0f').join('-');try{const response=await fetch('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/'+code+'.svg',{signal:AbortSignal.timeout(1600),redirect:'error'});if(!response.ok)throw Error();const data=await response.text();if(data.length>30000||!data.startsWith('<svg'))throw Error();const uri='data:image/svg+xml;base64,'+Buffer.from(data).toString('base64');if(emojiCache.size>=48)emojiCache.delete(emojiCache.keys().next().value);emojiCache.set(text,uri);result.set(text,uri);}catch{result.set(text,missingGlyph);}}}));return result;
}
function localizeText(node,assets){
 if(node==null||typeof node==='number')return node;
 if(typeof node==='string'){
  const units=segments(node);if(!units.some(v=>isEmoji(v)||/[^\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}\n]/u.test(v)))return node;
  const words=node.split(/(\s+)/),parts=[];for(const word of words){if(!word)continue;const glyphs=segments(word);if(glyphs.some(isEmoji)){for(const [i,g] of glyphs.entries())parts.push(isEmoji(g)?h('img',{key:parts.length,src:assets.get(g)||missingGlyph,width:32,height:32,style:{width:'1em',height:'1em',marginLeft:3,marginRight:3}}):h('span',{key:parts.length},g));}else if(/[^\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}\n]/u.test(word)){for(const g of glyphs)parts.push(/[^\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}]/u.test(g)?h('img',{key:parts.length,src:missingGlyph,width:32,height:32,style:{width:'1em',height:'1em'}}):h('span',{key:parts.length},g));}else parts.push(h('span',{key:parts.length},word.replace(/ /g,'\u00a0')));}
  return h('span',{style:{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'center'}},...parts);
 }
 if(Array.isArray(node))return node.map(n=>localizeText(n,assets));
 if(node.props){const children=localizeText(node.props.children,assets);return h(node.type,{...node.props,key:node.key,...(node.type==='div'?{style:{display:'flex',...node.props.style}}:{})},...(Array.isArray(children)?children:[children]));}return node;
}
const div=(style,...children)=>h('div',{style:Object.fromEntries(Object.entries({display:'flex',...style}).filter(([,value])=>value!==undefined))},...children);
function wordmark(size){return div({fontFamily:'Poppins',fontWeight:700,fontSize:size,letterSpacing:-size*.075,lineHeight:1,color:'#faf6ff'},'void',h('span',{style:{color:'#ba90f2'}},'.'));}
function stars(rating,size){const path='M12 2 15 8.2 22 9.2 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.2 9 8.2Z';return div({gap:8,alignItems:'center'},...Array.from({length:5},(_,i)=>h('svg',{key:i,width:size,height:size,viewBox:'0 0 24 24'},h('path',{d:path,fill:'#ffffff20'}),h('defs',null,h('clipPath',{id:'s'+i},h('rect',{x:0,y:0,width:24*Math.max(0,Math.min(1,rating-i)),height:24}))),h('path',{d:path,fill:'#d6b7ff',clipPath:'url(#s'+i+')'}))));}
// Only the address drawn on the image; sharing URLs still use the server's origin.
export const CARD_DESIGN={siteText:'',storySafeTop:.14,storySafeBottom:.20,storyPosterWidth:.70,brand:'#8450b8'};
function poster(model,asset,width,height){const style={width,height,borderRadius:22,boxShadow:'0 24px 55px #00000070',overflow:'hidden',flexShrink:0};return asset.src?h('img',{src:asset.src,width,height,style:{...style,objectFit:'contain'}}):div({...style,backgroundImage:'linear-gradient(145deg,#67438b,#23182f 70%)',alignItems:'center',justifyContent:'center',padding:24},div({fontWeight:600,fontSize:Math.min(36,width/10),textAlign:'center',lineHeight:1.25},shareText(model.title,65)));}
function measure(text,size){return segments(text).reduce((sum,c)=>sum+size*(/\s/u.test(c)?.3:/[ilI.,!:;'|]/u.test(c)?.29:/[MW@]/u.test(c)?.95:/[A-ZÁÉÍÓÚÃÕÇ]/u.test(c)?.72:isEmoji(c)?1.15:.59),0);}
function lines(text,width,size,max){const words=String(text).split(/\s+/),result=[];let current='';for(const word of words){const next=current?current+' '+word:word;if(measure(next,size)<=width){current=next;continue;}if(current){result.push(current);current='';}if(result.length===max){current=word;break;}for(const glyph of segments(word)){if(measure(current+glyph,size)>width){result.push(current);current='';if(result.length===max)break;}current+=glyph;}if(result.length===max)break;}if(current&&result.length<max)result.push(current);if(result.join(' ')!==String(text)){let last=result.pop()||'';while(measure(last+'…',size)>width)last=segments(last).slice(0,-1).join('');result.push(last.replace(/[…\s]+$/,'')+'…');}return result;}
const textRows=(rows,size,color,weight=400)=>div({flexDirection:'column',alignItems:'center',width:'100%',flexShrink:0,fontSize:size,fontWeight:weight,lineHeight:1.25,color},...rows.map((line,i)=>div({width:'100%',height:size*1.25,justifyContent:'center',whiteSpace:'nowrap'},line)));
function tint(color){const rgb=color.match(/[a-f0-9]{2}/gi)?.map(v=>parseInt(v,16))||[110,67,160],brand=[132,80,184],mx=Math.max(...rgb),mn=Math.min(...rgb),d=mx-mn;let hue=d===0?270:mx===rgb[0]?60*((rgb[1]-rgb[2])/d%6):mx===rgb[1]?60*((rgb[2]-rgb[0])/d+2):60*((rgb[0]-rgb[1])/d+4);hue=(hue+360)%360;const distance=Math.min(Math.abs(hue-270),360-Math.abs(hue-270)),mix=distance>65?.48:.22;return '#'+rgb.map((v,i)=>Math.round(v*(1-mix)+brand[i]*mix).toString(16).padStart(2,'0')).join('');}
export function cardTree(model,options,asset={colors:fallbacks},authorAvatar=null){
 const {width,height}=shareFormats[options.format],story=options.format==='story',og=options.format==='og',square=options.format==='square',minimal=options.template==='minimal';
 const x=og?56:64,contentWidth=width-x*2,top=story?Math.round(height*CARD_DESIGN.storySafeTop):40,bottom=story?Math.round(height*CARD_DESIGN.storySafeBottom):40,area=height-top-bottom;
 const titleSize=og?38:square?44:50,quoteSize=og?25:32,logoSize=og?64:story?82:76,gap=og?16:20;
 const titleLines=lines(model.title,og?contentWidth-360:contentWidth,titleSize,2);
 const quote=!minimal&&options.excerpt&&model.excerpt?(model.spoiler?model.excerpt:'“'+model.excerpt+'”'):'';
 const quoteLines=quote?lines(quote,og?contentWidth-360:contentWidth,quoteSize,3):[];
 const identity=options.author?[model.displayName,model.username?'@'+model.username:''].filter(Boolean).join(' · '):'';
 const footerIdentity=identity?lines(identity,contentWidth,28,1):[];
 const provider=model.media==='jogos'?`Dados: RAWG · Capa: ${model.coverSource||'indisponível'}`:'Dados e imagens: TMDB';
 const credit=isEmoji([model.title,quote,options.author?model.displayName:''].join(' '))?provider+' · Emoji: Twemoji (CC-BY 4.0)':provider;
 const site=CARD_DESIGN.siteText.trim(),footerHeight=(identity?(authorAvatar?64:35)+8:0)+(site?28+8:0)+23;
 const titleHeight=titleLines.length*titleSize*1.25,yearHeight=model.year?32+10:0,ratingHeight=og?48:58,quoteHeight=quoteLines.length?quoteLines.length*quoteSize*1.25+gap:0;
 const textHeight=titleHeight+yearHeight+ratingHeight+gap+quoteHeight;
 const centerHeight=area-logoSize-footerHeight-gap*2;
 const ratio=asset.ratio||2/3;
 const targetWidth=story?width*CARD_DESIGN.storyPosterWidth:width*(square?.57:.62);
 const posterHeight=og?Math.min(centerHeight,360):Math.min(targetWidth/ratio,centerHeight-textHeight-gap);
 const posterWidth=posterHeight*ratio;
 const blockHeight=og?Math.max(posterHeight,textHeight):posterHeight+gap+textHeight;
 const centerY=top+logoSize+gap+(centerHeight-blockHeight)/2+posterHeight/2;
 const title=textRows(titleLines,titleSize,'#fcf8ff',600);
 const year=model.year?div({justifyContent:'center',fontSize:26,color:'#d4ccdd',marginTop:10,height:32,flexShrink:0},model.year):null;
 const rating=div({alignItems:'center',justifyContent:'center',gap:22,height:ratingHeight,marginTop:gap,flexShrink:0},stars(model.rating,og?42:54),div({fontSize:og?34:44,fontWeight:700,color:'#d6b7ff'},model.rating.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'/5'));
 const review=quoteLines.length?div({marginTop:gap,width:'100%',flexShrink:0},textRows(quoteLines,quoteSize,'#eee5f5')):null;
 const details=div({flexDirection:'column',alignItems:'center',width:og?contentWidth-posterWidth-40:'100%',flexShrink:0},title,year,rating,review);
 const center=div({height:centerHeight,width:'100%',flexShrink:0,justifyContent:'center',alignItems:'center'},div({flexDirection:og?'row':'column',alignItems:'center',gap:og?40:gap,width:'100%'},poster(model,asset,posterWidth,posterHeight),details));
 const footer=div({height:footerHeight,width:'100%',flexShrink:0,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8},identity?div({alignItems:'center',justifyContent:'center',gap:16,width:'100%'},authorAvatar?h('img',{src:authorAvatar,width:64,height:64,style:{borderRadius:32,backgroundColor:avatarColor(model.authorAvatar),flexShrink:0}}):null,div({width:authorAvatar?contentWidth-96:'100%'},textRows(footerIdentity,28,'#f2eaf9',500))):null,site?textRows([site],22,'#c8b7db'):null,textRows([credit],18,'#b5a5c6'));
 const glow=tint(asset.colors[0]),corner=tint(asset.colors[1]);
 return div({width,height,position:'relative',backgroundColor:'#0e0a15',backgroundImage:'radial-gradient(ellipse at 50% '+Math.round(centerY/height*100)+'%,'+glow+'b0,transparent 66%),radial-gradient(ellipse at 100% 100%,'+corner+'22,transparent 65%),linear-gradient(180deg,#100c19,#100b18)',color:'#faf5ff',fontFamily:'Poppins',paddingTop:top,paddingBottom:bottom,paddingLeft:x,paddingRight:x,flexDirection:'column',alignItems:'center'},div({height:logoSize,width:'100%',justifyContent:'center',flexShrink:0},wordmark(logoSize)),div({height:gap,flexShrink:0}),center,div({height:gap,flexShrink:0}),footer);
}
export function imageKey(model,options){return createHash('sha256').update(JSON.stringify({version:4,design:CARD_DESIGN,model,options:{format:options.format,template:options.template,excerpt:options.excerpt,author:options.author}})).digest('hex');}
export async function renderReviewCard(model,options){
 const key=imageKey(model,options),hit=images.get(key);if(hit&&hit.until>Date.now())return {buffer:hit.buffer,key};if(pending.has(key))return pending.get(key);if(rendering>=2)throw Error('RATE_LIMIT');
 const task=(async()=>{rendering++;try{const [asset,loadedFonts,emoji,authorAvatar]=await Promise.all([posterAsset(model.poster,model.media),fonts(),emojiAssets(model,options),options.author?authorAvatarAsset(model.authorAvatar):null]);const dimensions=shareFormats[options.format],response=new ImageResponse(localizeText(cardTree(model,options,asset,authorAvatar),emoji),{...dimensions,fonts:loadedFonts});let buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>4*1024*1024)buffer=await sharp(buffer).png({palette:true,quality:95}).toBuffer();if(buffer.length>4*1024*1024)throw Error('UNAVAILABLE');
  while(images.size&&(cacheBytes+buffer.length>16*1024*1024||images.size>=16)){const old=images.keys().next().value;cacheBytes-=images.get(old).buffer.length;images.delete(old);}const old=images.get(key);if(old)cacheBytes-=old.buffer.length;images.set(key,{buffer,until:Date.now()+600000});cacheBytes+=buffer.length;return {buffer,key};
 }finally{rendering--;}})();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
