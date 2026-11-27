import { useState } from 'react';
import { ListMediaFilter } from './ListMedia';
import Icon from '../Icon';
import Link from 'next/link';
import { useLists } from '../../lib/use-lists';
import { ListCard,ListEmpty,ListError,ListSkeleton } from './ListUI';
export default function ProfileLists({target,owner}) {
  const [media,setMedia]=useState(null);const lists=useLists({mode:'profile',owner:target,media});
  return <section className="vl-profile-lists"><div className="vl-section-heading"><h2>Listas</h2>{owner&&<Link href="/listas">Gerenciar minhas listas <Icon name="arrow-up-right"/></Link>}</div><ListMediaFilter value={media} onChange={setMedia}/>{lists.loading&&!lists.more?<ListSkeleton/>:<>{lists.error&&<ListError retry={lists.more?lists.loadMore:lists.refresh}/>}<div className="vl-grid">{lists.rows.map(list=><ListCard key={list.id} list={list}/>)}</div>{!lists.error&&!lists.rows.length&&<ListEmpty title="Nenhuma lista disponível">{owner?<Link href="/listas?nova=1">Crie sua primeira lista.</Link>:'Nenhuma lista disponível para você neste perfil.'}</ListEmpty>}{lists.has_more&&!lists.error&&<button disabled={lists.loading} onClick={lists.loadMore}>Ver mais listas</button>}</>}</section>;
}
