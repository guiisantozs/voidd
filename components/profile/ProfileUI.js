import {ShareReviewButton} from '../review-share/ReviewShare';
import { formatRating } from '../../lib/catalog';
import Icon, { RatingStars } from '../Icon';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { safeProfileImage } from '../../lib/profile';
import { workHref } from '../../lib/work-client';
import { useAccount } from '../AccountProvider';
import { useVisibleSection } from '../../lib/use-visible-section';
import { avatarStoragePath, signedAvatarUrl } from '../../lib/profile-images';
import { useCharacterAvatar } from '../avatars/AvatarProvider';
import { avatarAlt, avatarColor, avatarImageUrl } from '../../lib/avatars';
import GameCover from '../GameCover';

export function ProfileAvatar({profile={},fallback='initial',lazySigning=false}){
  const {client,user}=useAccount();
  const character=useCharacterAvatar(profile),characterSource=avatarImageUrl(character,192);
  const [failedCharacter,setFailedCharacter]=useState('');
  const showCharacter=characterSource&&failedCharacter!==characterSource;
  const [failed,setFailed]=useState(false),[signed,setSigned]=useState(null);
  const source=safeProfileImage(profile.avatar_url),path=avatarStoragePath(source,process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [avatarRef,nearViewport]=useVisibleSection(lazySigning&&!!path);
  const visible=!lazySigning||nearViewport;
  const viewer=user?.id||'guest';
  const image=path?(signed?.source===source&&signed.viewer===viewer?signed.url:''):source;
  useEffect(()=>{
    let active=true;setFailed(false);setSigned(null);
    if(showCharacter||!visible||!path||!client)return;
    function refresh(){if(path&&client&&document.visibilityState!=='hidden')signedAvatarUrl(client,path,viewer).then(url=>{if(active){setFailed(false);setSigned({source,viewer,url});}}).catch(()=>{});}
    refresh();
    const timer=path?setInterval(refresh,90000):null;
    document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[client,source,path,viewer,visible,showCharacter]);
  return <span ref={avatarRef} style={showCharacter?{background:avatarColor(character)}:undefined} className={`vp-avatar ${fallback==='void'?'vp-avatar-void':''}`}>{showCharacter?<img key={characterSource} src={characterSource} srcSet={`${avatarImageUrl(character,96)} 96w, ${characterSource} 192w, ${avatarImageUrl(character,384)} 384w`} sizes="(max-width: 760px) 96px, 128px" alt={avatarAlt(character)} width={192} height={192} loading="lazy" decoding="async" onError={()=>setFailedCharacter(characterSource)}/>:image&&!failed?<img src={image} alt={`Avatar de ${profile.display_name||'usuário'}`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{fallback==='void'?<Icon name="user"/>:(profile.display_name||'V').slice(0,1).toUpperCase()}</span>}</span>;
}
export function ProfilePoster({item,sizes="160px"}){const [failed,setFailed]=useState(false);const src=safeProfileImage(item?.poster);useEffect(()=>setFailed(false),[src]);if(item?.categoria==='jogos')return <GameCover item={item} className="vp-poster" sizes={sizes}/>;return src&&!failed?<img className="vp-poster" src={src} alt={`Pôster de ${item.titulo}`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="vp-poster vp-poster-empty" role="img" aria-label={`Pôster indisponível de ${item?.titulo||'obra'}`}>void.</span>;}
export function ProfileReviewCard({row,full=false,owner}){const [expanded,setExpanded]=useState(false);const item=row.payload.item;return <article className={`vp-review-card ${full?'vp-review-full':''}`}><Link href={workHref(item)}><ProfilePoster item={item} sizes={full?"95px":"65px"}/></Link><div><Link className="vp-review-title" href={workHref(item)}>{item.titulo}</Link><p className="vp-stars" aria-label={`Nota ${formatRating(Number(row.payload.nota))} de 5`}><span aria-hidden="true"><RatingStars value={row.payload.nota} /></span><small>{formatRating(Number(row.payload.nota))}/5</small></p>{row.payload.spoiler?<details><summary>Mostrar spoiler</summary><p className="vp-review-copy">{row.payload.texto||'Sem comentário.'}</p></details>:<><p className={`vp-review-copy ${!expanded?'vp-clamp':''}`}>{row.payload.texto||'Avaliou sem deixar comentário.'}</p>{full&&row.payload.texto?.length>200&&<button className="vp-text-button" onClick={()=>setExpanded(v=>!v)}>{expanded?'Mostrar menos':'Ler mais'}</button>}</>}<p className="vp-review-date"><time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleDateString('pt-BR')}</time>{row.payload.public!==true&&<span> · Privada</span>}</p>{item.categoria==='filmes'&&<ShareReviewButton owner={owner||row.user_id} itemKey={row.item_key}/>}</div></article>;}
export function ProfileError({retry,text='Não foi possível carregar esta seção.'}){return <div className="vp-empty" role="status"><p>{text}</p>{retry&&<button onClick={retry}>Tentar novamente</button>}</div>;}
export function ProfileSkeleton({small=false}){return <div className={`vp-skeleton ${small?'vp-skeleton-small':''}`} role="status" aria-label="Carregando perfil"><div/><div/><div/></div>;}
