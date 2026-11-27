import {useMediaSearch} from '../../lib/use-media-search';
import MediaSearchPagination from '../MediaSearchPagination';
import {publicCatalog} from '../../lib/public-catalog-client';
import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { ProfileError, ProfilePoster, ProfileSkeleton } from './ProfileUI';
import { profileBanner, positionBanner } from '../../lib/profile-banner';

export default function ProfileBannerPicker({value,onChange}) {
  const [query,setQuery]=useState(''),[movie,setMovie]=useState(null),[art,setArt]=useState({}),[retry,setRetry]=useState(0),[previewMode,setPreviewMode]=useState('desktop');
  const banner=profileBanner(value);
  const search=useMediaSearch({media:'filmes',query,enabled:!movie}),{results}=search;
  useEffect(()=>{
    if(!movie)return;
    const controller=new AbortController();setArt({loading:true});
    publicCatalog.request(`/api/profile-banner?id=${movie.id}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setArt(data);}).catch(error=>{if(!controller.signal.aborted)setArt({error:error.message||'Imagens indisponíveis.'});});
    return()=>controller.abort();
  },[movie,retry]);
  return <section className="vp-banner-picker" aria-label="Escolher banner"><div className="vp-banner-preview-heading"><h3>Banner do perfil</h3><div role="group" aria-label="Formato da prévia"><button type="button" aria-pressed={previewMode==='desktop'} onClick={()=>setPreviewMode('desktop')}>Desktop</button><button type="button" aria-pressed={previewMode==='mobile'} onClick={()=>setPreviewMode('mobile')}>Celular</button></div></div><div className={`vp-banner-preview vp-banner-framed ${previewMode==='mobile'?'is-mobile':''}`}>{banner.source?<img src={banner.source} style={{objectPosition:`${banner.x}% ${banner.y}%`}} alt="Prévia do enquadramento do seu banner"/>:<span>Seu universo no VOID</span>}<span className="vp-banner-preview-avatar" aria-hidden="true">V</span></div>{value&&<div className="vp-banner-position"><p>Ajuste o enquadramento para destacar o personagem ou a cena.</p><label>Horizontal <input type="range" min="0" max="100" value={banner.x} onChange={e=>onChange(positionBanner(value,e.target.value,banner.y))}/></label><label>Vertical <input type="range" min="0" max="100" value={banner.y} onChange={e=>onChange(positionBanner(value,banner.x,e.target.value))}/></label><button type="button" className="vp-text-button" onClick={()=>onChange(positionBanner(value,50,40))}>Centralizar imagem</button></div>}<button type="button" className="vp-text-button" disabled={!value} onClick={()=>onChange('')}>Usar gradiente do VOID</button><label>Buscar um filme <input type="search" maxLength={80} placeholder="Ex.: Interestelar" value={query} onChange={e=>{setQuery(e.target.value);setMovie(null);}}/></label>
    {movie?<><div className="vp-art-heading"><h4>{movie.titulo}</h4><button type="button" onClick={()=>setMovie(null)}><Icon name="arrow-left"/> Voltar aos filmes</button></div><p className="vp-muted">Prefira imagens horizontais, sem texto. Elas preservam melhor a cena no banner.</p>{art.loading?<ProfileSkeleton small/>:art.error?<ProfileError text={art.error} retry={()=>setRetry(n=>n+1)}/>:art.images?.length?<div className="vp-art-grid">{art.images.map((image,i)=><button key={image.url} type="button" aria-pressed={banner.source===image.url} onClick={()=>onChange(image.url)}><img src={image.thumb} alt={`${image.type==='poster'?'Pôster':'Imagem horizontal'} ${i+1} de ${movie.titulo}`} loading="lazy"/><span>{image.type==='poster'?'Pôster':'Horizontal'}{banner.source===image.url&&<Icon name="check"/>}</span></button>)}</div>:<p className="vp-muted">Este filme ainda não tem imagens disponíveis.</p>}</>:results.loading?<ProfileSkeleton small/>:results.error?<ProfileError text={results.error} retry={search.retry}/>:results.items?.length?<div className="vp-banner-films">{results.items.map(item=><button type="button" key={item.id} onClick={()=>setMovie(item)}><ProfilePoster item={item}/><span>{item.titulo}<small>{item.ano}</small></span></button>)}</div>:<p className="vp-muted">Nenhum filme encontrado. Tente outro título.</p>}
    {!movie&&<MediaSearchPagination search={search}/>}<small className="vp-muted">Dados fornecidos por TMDB</small></section>;
}
