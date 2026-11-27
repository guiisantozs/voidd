import Link from 'next/link';
import Icon from '../Icon';
import {ProfilePoster,ProfileError,ProfileSkeleton} from './ProfileUI';
import {useProfileContent} from '../../lib/use-profile-content';
import {activityPresentation} from '../../lib/profile-content';

export default function ProfileActivity({target}){
 const state=useProfileContent(target,'activity');
 return <section className="vp-section"><div className="vp-section-title"><h2>Atividade</h2></div>{state.error&&<ProfileError retry={state.refresh}/>}<ol className="vp-activity-list">{state.rows.map(row=>{const event=activityPresentation({...row,owner:target});return <li key={row.event_key}><span className="vp-activity-icon"><Icon name={event.icon}/></span>{event.item&&<ProfilePoster item={event.item} sizes="38px"/>}<div>{event.href?<Link href={event.href}>{event.text}</Link>:<span>{event.text}</span>}<time dateTime={row.occurred_at}>{new Date(row.occurred_at).toLocaleString('pt-BR')}</time></div></li>;})}</ol>{state.loading&&<ProfileSkeleton small/>}{!state.loading&&!state.error&&!state.rows.length&&<p className="vp-empty">Nenhuma atividade por aqui ainda.</p>}{state.rows.length<state.total&&!state.error&&<button className="vp-load-more" disabled={state.loading} onClick={state.more}>Carregar mais</button>}</section>;
}
