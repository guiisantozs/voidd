import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { useAccount } from '../AccountProvider';
import { claimInvite,clearInvite,inviteMessage,requestFriend } from '../../lib/friend-invites';
import { CONNECTIONS_EVENT,connectionError } from '../../lib/friends';

// Outside the keyed page tree: sync/page remounts cannot replay a referral.
export default function PendingFriendInvite() {
  const {user,client,ready,ownProfile,recovery}=useAccount();
  const owner=user?.id,current=useRef(owner),attempt=useRef('');current.current=owner;
  const [notice,setNotice]=useState(null),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!ready||!owner||!client||!ownProfile?.username||recovery)return;
    let reference;try{reference=claimInvite(localStorage,owner);}catch{return;}
    if(!reference)return;
    const key=`${owner}:${reference.createdAt}:${reference.handle}:${retry}`;
    if(attempt.current===key)return;attempt.current=key;
    requestFriend(client,reference.handle).then(status=>{
      if(current.current!==owner)return;
      try{clearInvite(localStorage,reference);}catch{/* Server is idempotent if storage is blocked. */}
      setNotice({owner,text:inviteMessage(status)});
      window.dispatchEvent(new CustomEvent(CONNECTIONS_EVENT,{detail:{user_id:owner}}));
    }).catch(error=>{if(current.current===owner)setNotice({owner,text:connectionError(error),error:true});});
  },[ready,owner,client,ownProfile?.username,recovery,retry]);
  if(!notice||notice.owner!==owner)return null;
  return <div className="circle-referral-notice" role="status" aria-live="polite"><span>{notice.text}</span><Link href="/amigos?aba=convites">Ver convites</Link>{notice.error&&<button onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button>}<button onClick={()=>setNotice(null)} aria-label="Fechar aviso de convite">×</button></div>;
}
