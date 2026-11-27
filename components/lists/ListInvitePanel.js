import {useRef,useState} from 'react';
import {useAccount} from '../AccountProvider';
import PeoplePicker from '../social/PeoplePicker';
import Icon from '../Icon';
import {socialRpc,socialError} from '../../lib/social-community';
import {listsChanged} from '../../lib/lists';

export default function ListInvitePanel({list,onChanged}){
 const {client,user}=useAccount(),[tab,setTab]=useState('friends'),[link,setLink]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false);
 async function invite(ids){const sent=[];let failure;try{for(const person of ids){try{await socialRpc(client,'void_list_invitation',{target:list.id,person,action:'invite'});sent.push(person);}catch(error){failure=error;}}}finally{onChanged();listsChanged();}if(failure&&!sent.length)throw failure;return {sent,message:failure?`${sent.length} convites enviados. ${socialError(failure)}`:'Convites enviados.'};}
 async function manage(action){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{const data=await socialRpc(client,'void_list_link',{target:list.id,action});setLink(data);if(data.token){const url=`${location.origin}/listas/convite?token=${data.token}`;try{await navigator.clipboard.writeText(url);setMessage('Link de convite copiado.');}catch{setMessage('Copie o endereço no campo abaixo.');}}else setMessage('Link desativado. Gere outro para permitir novos participantes.');}catch(error){setMessage(socialError(error));}finally{lock.current=false;setBusy(false);}}
 return <div className="vs-invite"><p className="vs-muted">Convide pessoas para {list.title}. Cada pessoa confirma a participação na própria conta.</p><div className="vs-tabs" aria-label="Como convidar">{[['friends','Amigos'],['search','Buscar usuário'],['link','Link de convite']].map(([key,label])=><button type="button" key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</div>
 {tab!=='link'?<PeoplePicker key={`${user.id}:${list.id}:${tab}`} target={list.id} mode={tab} onSend={invite}/>:<section className="vs-link-panel"><Icon name="lock"/><h3>Uma porta para novas histórias</h3><p>Quem tiver um link ativo poderá solicitar entrada ao entrar na própria conta. Pessoas removidas ou bloqueadas não podem entrar pelo link.</p><button type="button" className="vs-primary" disabled={busy} onClick={()=>manage('get')}>Copiar link de convite</button>{link?.token&&<label>Link ativo<input readOnly value={`${typeof location==='undefined'?'':location.origin}/listas/convite?token=${link.token}`} onFocus={e=>e.target.select()}/></label>}<div className="vs-actions"><button type="button" disabled={busy} onClick={()=>manage('rotate')}>Gerar novo link</button><button type="button" disabled={busy} onClick={()=>manage('disable')}>Desativar link</button></div><p className="vs-muted">Gerar um novo link invalida o endereço anterior.</p><p role="status" aria-live="polite">{busy?'Atualizando…':message}</p></section>}
 </div>;
}
