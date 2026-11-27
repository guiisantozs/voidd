import Icon from '../Icon';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { useAccount } from '../AccountProvider';
import { CONNECTIONS_EVENT } from '../../lib/friends';

export default function FollowButton({target,following,onChanged,followLabel='Seguir',followingLabel='Seguindo',disabled=false}){
  const {client,user}=useAccount();const [busy,setBusy]=useState(false),[active,setActive]=useState(following),[error,setError]=useState('');
  useEffect(()=>setActive(following),[following]);
  if(target===user?.id)return null;
  if(!user)return <Link className="vp-button vp-primary" href="/conta">Entre para seguir</Link>;
  async function toggle(){setBusy(true);setError('');try{const operation=active?client.from('follows').delete().eq('follower_id',user.id).eq('followed_id',target):client.from('follows').insert({follower_id:user.id,followed_id:target});const {error}=await operation;if(error)throw error;setActive(!active);window.dispatchEvent(new CustomEvent(CONNECTIONS_EVENT,{detail:{user_id:user.id}}));onChanged?.();}catch{setError('Não foi possível atualizar. Tente novamente.');}finally{setBusy(false);}}
  return <span className="vp-follow-control"><button className={active?'vp-button':'vp-button vp-primary'} disabled={busy||disabled} aria-pressed={!!active} onClick={toggle}>{busy?'Atualizando…':active?<><Icon name="check" />{' '}{followingLabel}</>:<><Icon name="plus" />{' '}{followLabel}</>}</button>{error&&<small role="status">{error}</small>}</span>;
}
