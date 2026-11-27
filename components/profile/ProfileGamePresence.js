import Link from 'next/link';
import {useAccount} from '../AccountProvider';
import {useLibrary} from '../../lib/use-library';
import {gameStatusKey} from '../../lib/library';
import {workHref} from '../../lib/work-client';
import GamePresenceBadge from '../games/GamePresenceBadge';

export default function ProfileGamePresence({target}){
  const {user}=useAccount(),library=useLibrary();
  if(user?.id!==target)return null;
  const playing=Object.values(library.entries).filter(record=>gameStatusKey(record)==='playing_now');
  if(!playing.length)return null;
  return <section className="vp-section profile-game-presence" aria-label="Sua atividade manual de jogos"><div className="vp-section-title"><h2>Jogando agora</h2></div><p>Atividade manual da sua biblioteca privada. Visível para você.</p><div>{playing.map(record=><article key={record.item.id}><Link href={workHref(record.item)}>{record.item.titulo}</Link><GamePresenceBadge record={record}/><button type="button" disabled={!library.ready} onClick={()=>library.update(record.item,'playing')}>Passar para Em andamento</button></article>)}</div>{library.error&&<p role="status">{library.error}</p>}</section>;
}
