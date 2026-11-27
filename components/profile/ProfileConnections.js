import { profileHref,withIdentities } from '../../lib/usernames';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { useAccount } from '../AccountProvider';
import DetailModal from '../movies/DetailModal';
import FollowButton from './FollowButton';
import { ProfileAvatar,ProfileError,ProfileSkeleton } from './ProfileUI';

export default function ProfileConnections({target,type,onClose,onChanged}){
  const {client,user}=useAccount();const [state,setState]=useState({loading:true,people:[]}),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  useEffect(()=>{if(!client)return;let active=true;setState(old=>({...old,loading:true,error:false}));client.rpc('void_profile_connections',{target,list_type:type,page_offset:offset}).then(async({data,error})=>{if(!active)return;if(error)throw error;data.people=await withIdentities(client,data.people);if(!active)return;setState(old=>({...data,people:offset?[...old.people,...data.people.filter(p=>!old.people.some(q=>q.user_id===p.user_id))]:data.people}));}).catch(()=>{if(active)setState(old=>({...old,loading:false,error:true}));});return()=>{active=false;};},[client,target,type,offset,revision,user?.id]);
  function refresh(){setOffset(0);setRevision(n=>n+1);onChanged();}
  const title={followers:'Seguidores',following:'Seguindo',friends:'Amigos'}[type];
  return <DetailModal title={title} onClose={onClose}><div className="vp-connection-list">{type==='friends'&&<p className="vp-muted">Seguimentos recíprocos e amizades aceitas. Convites antigos só são visíveis aos participantes.</p>}{state.error&&<ProfileError retry={()=>setRevision(n=>n+1)}/>} {state.people.map(person=><article key={person.user_id}><Link href={profileHref(person)} onClick={onClose}><ProfileAvatar profile={person}/><span><strong>{person.display_name}</strong><small>{person.username?`@${person.username}`:'Perfil reservado'}{type==='friends'&&person.mutual?' · Amigo mútuo':''}</small></span></Link><FollowButton target={person.user_id} following={person.following} onChanged={refresh}/></article>)}{state.loading&&<ProfileSkeleton small/>}{!state.loading&&!state.error&&!state.people.length&&<p className="vp-empty">Ainda não há pessoas nesta lista.</p>}{state.people.length<state.total&&<button disabled={state.loading} onClick={()=>setOffset(state.people.length)}>Carregar mais</button>}</div></DetailModal>;
}
