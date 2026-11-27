import {useEffect,useState} from 'react';
import {useAccount} from '../AccountProvider';
import {CONNECTIONS_EVENT} from '../../lib/friends';
import {socialChanged,socialError,socialRpc} from '../../lib/social-community';
export default function BlockedPeople({revision}){
 const {user,client}=useAccount(),[rows,setRows]=useState([]),[attempt,setAttempt]=useState(0),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!user)return;const abort=new AbortController();socialRpc(client,'void_blocked_people',{},abort.signal).then(data=>{if(!abort.signal.aborted){setRows(data||[]);setMessage('');}}).catch(()=>{if(!abort.signal.aborted)setMessage('Não foi possível carregar seus bloqueios.');});return()=>abort.abort();},[client,user?.id,revision,attempt]);
 async function unblock(id){setBusy(true);try{const {error}=await client.from('user_blocks').delete().eq('blocker_id',user.id).eq('blocked_id',id);if(error)throw error;setAttempt(n=>n+1);socialChanged();window.dispatchEvent(new Event(CONNECTIONS_EVENT));}catch(error){setMessage(socialError(error));}finally{setBusy(false);}}
 if(!user)return null;
 return <details className="vs-blocked"><summary>Contatos bloqueados</summary><p className="vs-muted">Bloquear impede novos convites e recomendações, encerra a amizade e remove a participação em listas entre vocês. Desbloquear não restaura conexões.</p>{!rows.length?<p>Nenhum contato bloqueado.</p>:<ul>{rows.map(p=><li key={p.blocked_id}><span>{p.display_name||'Contato bloqueado'}</span><button type="button" disabled={busy} onClick={()=>unblock(p.blocked_id)}>Desbloquear</button></li>)}</ul>}<p role="status">{message}</p></details>;
}
