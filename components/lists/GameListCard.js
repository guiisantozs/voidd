import ListParticipantLink from './ListParticipantLink';
import Link from 'next/link';
import Icon from '../Icon';
import LikeButton from '../LikeButton';
import GameCover from '../GameCover';
import {useAccount} from '../AccountProvider';
import {profileHref} from '../../lib/usernames';

export default function GameListCard({list,basePath='/jogos/listas',editable=true}){
  const {user}=useAccount(),owner=list.special||list.owner_id===user?.id;
  const covers=(list.cover||[]).filter(item=>item.categoria==='jogos').slice(0,5);
  const visibility={private:['lock','Privada'],public:['globe','Pública'],connections:['users','Só seguidores / amigos']}[list.visibility]||['lock','Privada'];
  const participants=Array.isArray(list.participants)?list.participants:[];
  const onlyGames=list.media_types?.length===1&&list.media_types[0]==='jogos';
  return <article className={`vgl-card${list.special?' vgl-card--featured':''}`}>
    <div className="vgl-card-art">
      {covers[0]&&<div className="vgl-card-backdrop" aria-hidden="true"><GameCover item={covers[0]} decorative sizes="300px"/></div>}
      <div className="vgl-card-topline"><span><Icon name={list.special?'list':'gamepad'}/>{list.special?'SUA PRÓXIMA AVENTURA':'SELEÇÃO DE JOGOS'}</span>{owner&&editable&&<Link href={`${basePath}/${list.id}?editar=1`} aria-label={`Editar lista ${list.title}`}><Icon name="edit"/> Editar lista</Link>}</div>
      <Link className="vgl-cover-link" href={`${basePath}/${list.id}`} tabIndex={-1} aria-label={`Abrir ${list.title}`}>
        {covers.length?<div className="vgl-cover-fan" aria-hidden="true">{covers.map((item,index)=><div className="vgl-cover-case" key={`${item.id}:${index}`} style={{'--fan-index':index,'--fan-offset':index-(covers.length-1)/2,'--fan-z':5-index}}><GameCover item={item} decorative sizes="130px"/></div>)}</div>:<div className="vgl-cover-empty"><Icon name="gamepad"/><span>Seu próximo jogo começa aqui</span></div>}
      </Link>
    </div>
    <div className="vgl-card-body"><div className="vgl-tags">{list.special&&<span className="vgl-tag vgl-tag--default"><Icon name="list"/> Padrão</span>}<span className={`vgl-tag vgl-tag--${list.visibility}`}><Icon name={visibility[0]}/>{visibility[1]}</span>{list.collaboration_enabled&&<span className="vgl-tag vgl-tag--shared"><Icon name="users"/> Colaborativa</span>}<span className="vgl-tag vgl-tag--games"><Icon name="gamepad"/> Jogos</span></div>
      <h2><Link href={`${basePath}/${list.id}`}>{list.title}</Link></h2>
      {!owner&&<Link className="vgl-card-author" href={profileHref({user_id:list.owner_id,username:list.username})}>{list.username?`@${list.username}`:'Pessoa do Void'}</Link>}
      <p className="vgl-card-description">{list.description||'Uma nova seleção, pronta para suas próximas escolhas.'}</p>
      {list.collaboration_enabled&&participants.length>0&&<div className="vgl-participants" aria-label={`${participants.length} participantes`}>{participants.slice(0,4).map(person=><ListParticipantLink key={person.user_id} person={person} avatarOnly/>)}{participants.length>4&&<span>+{participants.length-4}</span>}</div>}
      <div className="vgl-card-footer"><span><Icon name="gamepad"/> {list.item_count} {onlyGames?(list.item_count===1?'jogo':'jogos'):(list.item_count===1?'obra · lista mista':'obras · lista mista')}</span>{list.special?<Link className="vgl-open" href={`${basePath}/${list.id}`}>Explorar <Icon name="arrow-right"/></Link>:<LikeButton listId={list.id} likes={list.likes} liked={list.liked}/>}</div>
    </div>
  </article>;
}
