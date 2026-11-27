import Link from 'next/link';
import Icon from '../Icon';
import LikeButton from '../LikeButton';
import { useAccount } from '../AccountProvider';
import { profileHref } from '../../lib/usernames';
import ListCover from './ListCover';
import { ListMediaTags } from './ListMedia';
export {default as ListCover} from './ListCover';

export function ListVisibility({visibility='private',special=false}) {
  const label=({public:'Pública',connections:'Só seguidores / amigos',private:'Privada'})[visibility];
  return <span className="vl-visibility"><Icon name={visibility==='public'?'globe':visibility==='connections'?'users':'lock'}/>{label}</span>;
}
export function ListCard({list,basePath=list.media_types?.length===1&&list.media_types[0]==='animes'?'/animes/listas':list.media_types?.length===1&&list.media_types[0]==='series'?'/series/listas':'/listas',editable=true}) {
  const {user}=useAccount(),isOwner=list.special||list.owner_id===user?.id;
  return <article className={`vl-card ${list.special?'vl-card--featured':''}`}>
    {isOwner&&editable&&<Link className="vl-card-edit" href={`${basePath}/${list.special&&basePath==='/listas'?'ver-depois':list.id}?editar=1`} aria-label={`Editar lista ${list.title}`}><Icon name="edit"/> Editar lista</Link>}
    <Link className="vl-card-cover-link" href={`${basePath}/${list.id}`} tabIndex={-1} aria-label={`Abrir ${list.title}`}><ListCover items={list.cover} title={list.title} size={list.special?'large':'medium'}/></Link>
    <div className="vl-card-body"><div className="vl-card-tags">{list.special&&<span className="vl-default-tag">Padrão</span>}<ListVisibility visibility={list.visibility} special={list.special}/>{list.collaboration_enabled&&<span className="vl-default-tag"><Icon name="users"/> Colaborativa</span>}<ListMediaTags types={list.media_types}/></div>
      <h3><Link href={`${basePath}/${list.id}`}>{list.title}</Link></h3>
      <div className="vl-card-author">{!isOwner&&<Link href={profileHref({user_id:list.owner_id,username:list.username})}>{list.username?`@${list.username}`:'aguardando criar @'}</Link>}</div>
      <p className="vl-card-description">{list.description||'Sem descrição.'}</p>
      <div className="vl-card-meta"><span>{list.item_count} {list.item_count===1?'obra':'obras'}</span>{!list.special&&<LikeButton listId={list.id} likes={list.likes} liked={list.liked}/>}</div>
    </div>
  </article>;
}
export function ListSkeleton(){return <div className="vl-grid" role="status" aria-label="Carregando listas">{[0,1,2].map(i=><div key={i} className="vl-card vl-skeleton"><i className="m-skeleton"/><b className="m-skeleton"/><b className="m-skeleton"/></div>)}</div>;}
export function ListEmpty({title='Nenhuma lista por aqui',children,action}){return <div className="vl-empty"><h3>{title}</h3><p>{children||'Crie uma lista ou escolha uma ideia para começar.'}</p>{action&&<div className="vl-empty-action">{action}</div>}</div>;}
export function ListError({message='Não foi possível carregar as listas.',retry}){return <div className="vl-error" role="alert"><p>{message}</p>{retry&&<button onClick={retry}>Tentar novamente</button>}</div>;}
