import {useEffect,useState} from 'react';
import Icon from '../Icon';
import {universeReleaseDays} from '../../lib/universe-release-countdown';

export default function UniverseReleaseCountdown({release}){
  const [days,setDays]=useState(null);
  useEffect(()=>{const update=()=>setDays(universeReleaseDays(release.date));update();const timer=setInterval(update,60000);return()=>clearInterval(timer);},[release.date]);
  const label=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${release.date}T00:00:00Z`));
  return <a className="gu-release-countdown" href={release.source} target="_blank" rel="noopener noreferrer" aria-label={`${release.label}: lançamento previsto para ${label}. ${days===null?'':days?`Faltam ${days} dias.`:'Data de lançamento alcançada.'}`}><Icon name="calendar"/><span><small>{release.label} · <time dateTime={release.date}>{label}</time></small><strong>{days===null?'…':days===0?'O próximo capítulo chegou':`${days} ${days===1?'dia':'dias'} para o próximo capítulo`}</strong></span><Icon name="arrow-up-right"/></a>;
}
