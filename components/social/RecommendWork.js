import {useEffect,useState,useRef} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {useAccount} from '../AccountProvider';
import DetailModal from '../movies/DetailModal';
import {ProfileAvatar,ProfilePoster} from '../profile/ProfileUI';
import Icon from '../Icon';
import PeoplePicker from './PeoplePicker';
import {listEntry} from '../../lib/lists';
import {SOCIAL_EVENT,socialChanged,socialRpc} from '../../lib/social-community';

export default function RecommendWork({item,received=false}){const {user}=useAccount();return item?<WorkActions key={`${user?.id||'guest'}:${item.categoria}:${item.id}`} item={item} received={received}/>:null;}
function WorkActions({item,received}){
 const {user,client}=useAccount(),[modal,setModal]=useState(null),[note,setNote]=useState(''),[message,setMessage]=useState(''),[state,setState]=useState({}),[revision,setRevision]=useState(0),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(!received||!user)return;const abort=new AbortController();socialRpc(client,'void_work_recommendations',{media:item.categoria,external:String(item.id)},abort.signal).then(rows=>{if(!abort.signal.aborted)setState({rows});}).catch(()=>{if(!abort.signal.aborted)setState({error:true});});const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);window.addEventListener(SOCIAL_EVENT,refresh);return()=>{abort.abort();window.removeEventListener('focus',refresh);window.removeEventListener(SOCIAL_EVENT,refresh);};},[received,user?.id,client,item.categoria,item.id,revision]);
 const rows=state.rows||[];
 async function send(recipients){const data=await socialRpc(client,'void_recommend_work',{entry:listEntry(item),recipients,note});if(live.current){setMessage(data.sent?'Recomendação enviada!':'Essa recomendação já foi enviada aos amigos selecionados.');setModal('sent');socialChanged();}return recipients;}
 return <div className="vs-work-actions"><button type="button" className="vs-recommend" onClick={()=>{setNote('');setModal('send');}}><Icon name="heart"/> Recomendar para um amigo</button>
 {received&&user&&rows.length>0&&<button type="button" className="vs-received" onClick={()=>setModal('received')}><span className="vs-avatar-stack">{rows.slice(0,3).map(p=><ProfileAvatar key={p.user_id} profile={p}/>)}</span><span>{rows[0].display_name}{rows.length>1?` e mais ${rows.length-1} ${rows.length===2?'amigo recomendaram':'amigos recomendaram'}`:' recomendou'} {item.categoria==='jogos'?'este jogo':item.categoria==='filmes'?'este filme':item.categoria==='series'?'esta série':'este anime'} para você</span></button>}
 {received&&state.error&&<button type="button" className="vs-muted" onClick={()=>setRevision(n=>n+1)}>Recarregar recomendações recebidas</button>}
 {modal&&createPortal(<DetailModal title={modal==='received'?'Indicações dos seus amigos':modal==='sent'?'Enviado':'Recomendar para um amigo'} trapFocus className="vs-modal" onClose={()=>setModal(null)}><div className="vs-modal-body">
 {modal==='sent'?<><Icon name="check"/><p role="status">{message}</p><button type="button" onClick={()=>setModal(null)}>Concluir</button></>:modal==='received'?<ul className="vs-received-list">{rows.map(p=><li key={p.id}><ProfileAvatar profile={p}/><div><Link href={`/pessoas/${p.user_id}`}><strong>{p.display_name}</strong></Link><small>@{p.username}</small>{p.message&&<p>{p.message}</p>}<time dateTime={p.created_at}>{new Date(p.created_at).toLocaleDateString('pt-BR')}</time></div></li>)}</ul>:!user?<><p>Entre na sua conta para recomendar esta obra aos seus amigos.</p><Link href="/conta">Entrar na conta</Link></>:<><div className="vs-work-preview"><ProfilePoster item={item}/><div><strong>{item.titulo}</strong><small>{item.ano}</small></div></div><PeoplePicker onSend={send} label="Enviar recomendação"><label>Mensagem <span className="vs-muted">opcional</span><textarea value={note} maxLength={500} rows={3} onChange={e=>setNote(e.target.value)} placeholder="Por que você acha que seus amigos vão gostar?"/></label></PeoplePicker></>}
 </div></DetailModal>,document.body)}</div>;
}
