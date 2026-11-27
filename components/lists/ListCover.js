import { useState } from 'react';
import Icon from '../Icon';
import { safeProfileImage } from '../../lib/profile';
import GameCover from '../GameCover';

function CoverPoster({item}) {
  return item.categoria==='jogos'?<GameCover item={item}/>:<MediaCover item={item}/>;
}
function MediaCover({item}) {
  const [failed,setFailed]=useState(false);
  const source=safeProfileImage(item.poster);
  const url=source?new URL(source):null;
  if(url?.hostname==='image.tmdb.org')url.pathname=url.pathname.replace(/^\/t\/p\/(?:original|w\d+)\//,'/t/p/w185/');
  return url&&!failed?<img src={url.href} alt="" width="185" height="278" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="vl-cover-initial">{Array.from((item.titulo||'Lista').trim())[0]?.toLocaleUpperCase('pt-BR')||'L'}</span>;
}

export default function ListCover({items=[],title='lista',size='medium'}) {
  const posters=items.slice(0,5);
  return <div className={`vl-cover vl-cover--${size} ${posters.length?'':'is-empty'}`} role="img" aria-label={`Capa de ${title}${posters.length?'':': lista vazia'}`}>
    {posters.length?<div className="vl-cover-stack" aria-hidden="true">{posters.map((item,index)=><span className="vl-cover-poster" style={{zIndex:5-index}} key={`${item.categoria}:${item.id}:${index}`}><CoverPoster key={item.poster||'empty'} item={item}/></span>)}</div>:<div className="vl-cover-empty" aria-hidden="true"><Icon name="list"/><span>Lista vazia</span></div>}
  </div>;
}
