import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useAccount} from '../AccountProvider';
import {ProfileAvatar} from '../profile/ProfileUI';
import {profileHref} from '../../lib/usernames';
import {formatRating} from '../../lib/catalog';
import {overviewDistribution} from '../../lib/game-overview';
import {loadGameReviews} from '../../lib/game-community';
import Icon from '../Icon';
import {OverviewBlock,OverviewSkeleton,OverviewFailure} from './OverviewBlocks';

export default function OverviewSocial({item,summary,review,revision,onSection}){
  const {client,user}=useAccount(),[featured,setFeatured]=useState({loading:true}),[attempt,setAttempt]=useState(0),[expanded,setExpanded]=useState(false);
  useEffect(()=>{let active=true;setFeatured({loading:true});if(!client){setFeatured({row:null});return;}loadGameReviews(client,item.id,{sort:'likes'}).then(data=>{if(active)setFeatured({row:data.rows.find(row=>row.text?.trim())||null});}).catch(()=>{if(active)setFeatured({error:true});});return()=>{active=false;};},[client,user?.id,item.id,revision,attempt]);
  const data=summary.data,distribution=overviewDistribution(data?.histogram),maximum=Math.max(1,...distribution.map(bin=>bin.total));
  const friends=data?.friends||[],row=featured.row;
  function renderCommunity(){
    if(summary.loading)return <OverviewSkeleton name="community" title="Resumo da comunidade" order={5}/>;
    if(summary.error)return <OverviewFailure title="Resumo da comunidade" order={5} retry={summary.refresh}/>;
    return <OverviewBlock name="community" title="Resumo da comunidade" order={5}>{data?.total>0?<div className="go-community-summary"><div><strong className="go-average">{formatRating(data.average)}<small>/ 5</small></strong><p className="gp-subtle">{data.total} avaliações públicas</p></div><div className="go-distribution">{distribution.map(bin=><div key={bin.rating}><span>{bin.rating}<Icon name="star"/></span><i><b style={{'--go-bar':bin.total/maximum}}/></i><small>{bin.total}</small></div>)}<p className="gp-subtle">Faixas de uma estrela, incluindo zero.</p></div></div>:<div className="go-empty"><p>Seja o primeiro a avaliar.</p><button className="game-button" onClick={()=>onSection('sua-jornada')}>Deixar avaliação <Icon name="arrow-right"/></button></div>}<div className="go-own-review"><span>{review?<>Sua nota: {formatRating(review.nota)} <Icon name="star"/></>:'Já jogou? Deixe sua marca.'}</span><button className="gp-text-button" onClick={()=>onSection('sua-jornada')}>{review?'Minha avaliação':'Avaliar'}</button></div></OverviewBlock>;
  }
  function renderFriends(){
    if(summary.loading)return <OverviewSkeleton name="friends" title="O que seus amigos acham" order={6}/>;
    if(!user||!friends.length)return null;
    return <OverviewBlock name="friends" title="O que seus amigos acham" order={6}><div className="go-friends">{friends.slice(0,10).map(friend=><Link key={friend.user_id} href={profileHref(friend)} title={`${friend.display_name||'Pessoa do Void'} · Avaliou este jogo`}><ProfileAvatar profile={friend}/><strong>{formatRating(Number(friend.rating))}<Icon name="star"/></strong><span>{friend.display_name||'Pessoa do Void'}</span></Link>)}</div><button className="gp-text-button" onClick={()=>onSection('amigos')}>Ver todos <Icon name="arrow-right"/></button></OverviewBlock>;
  }
  function renderFeatured(){
    if(featured.loading)return <OverviewSkeleton name="featured" title="Avaliação em destaque" order={7}/>;
    if(featured.error)return <OverviewFailure title="Avaliação em destaque" order={7} retry={()=>setAttempt(value=>value+1)}/>;
    if(!row)return null;
    return <OverviewBlock name="featured" title="Avaliação em destaque" order={7}><div className="go-featured-header"><Link href={profileHref(row)}><ProfileAvatar profile={row}/><span>{row.display_name||'Pessoa do Void'}{row.username&&<small>@{row.username}</small>}</span></Link><strong><Icon name="star"/> {formatRating(Number(row.rating))} / 5</strong></div>{row.spoiler?<details className="gp-spoiler"><summary>Contém spoilers · Ler avaliação</summary><p className="gp-review-text">{row.text}</p></details>:<><p className="gp-review-text">{expanded?row.text:row.text.slice(0,260)+(row.text.length>260?'…':'')}</p>{row.text.length>260&&<button className="gp-text-button" onClick={()=>setExpanded(value=>!value)}>{expanded?'Ler menos':'Ler mais'}</button>}</>}<div className="go-featured-footer">{row.likes!=null&&Number.isFinite(Number(row.likes))&&<span><Icon name="heart"/> {Number(row.likes)} curtidas</span>}{row.updated_at&&<time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleDateString('pt-BR')}</time>}<button className="gp-text-button" onClick={()=>onSection('comunidade')}>Ver todas <Icon name="arrow-right"/></button></div></OverviewBlock>;
  }
  return <>{renderCommunity()}{renderFriends()}{renderFeatured()}</>;
}
