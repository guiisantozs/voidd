import Icon from '../Icon';
import { ListMediaPicker } from './ListMedia';
import { useRouter } from 'next/router';
import { useEffect,useRef,useState } from 'react';
import DetailModal from '../movies/DetailModal';
import { useAccount } from '../AccountProvider';
import IdeaPicker from './IdeaPicker';
import { allListMedia,listError,listsChanged,writeList } from '../../lib/lists';
export async function createInspiredList(client,idea,mediaTypes=idea?.media_types||allListMedia,collaborative){return writeList(client,null,{title:idea?.title||'Minha nova lista',description:idea?.description||'',visibility:'public',ranked:false,media_types:mediaTypes,...(collaborative!==undefined?{collaboration_enabled:collaborative}:{})},[]);}
export default function NewListDialog({onClose,onCreated,inline=false,fixedMedia=null,shared=false}) {
  const {client,user}=useAccount(),router=useRouter(),current=useRef(user?.id);current.current=user?.id;useEffect(()=>{current.current=user?.id;return()=>{current.current=null;};},[user?.id]);const [mediaTypes,setMediaTypes]=useState(null),[ideas,setIdeas]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [metadata,setMetadata]=useState({title:'',description:'',visibility:'public'}),saving=useRef(false);
  async function create(idea){if(busy||saving.current||!user)return;saving.current=true;setBusy(true);setMessage('');try{const owner=user.id,id=shared?await writeList(client,null,{...metadata,ranked:false,media_types:fixedMedia?[fixedMedia]:mediaTypes||allListMedia,collaboration_enabled:true},[]):await createInspiredList(client,idea,fixedMedia?[fixedMedia]:mediaTypes||idea?.media_types||allListMedia,false);if(current.current!==owner)return;listsChanged();if(onCreated)onCreated(id);else router.push(`/listas/${id}?${shared?'convidar=1':'editar=1'}`);}catch(error){if(current.current===user?.id){setMessage(listError(error));setBusy(false);}}finally{saving.current=false;}}
  const body=useRef(null),ideaTrigger=useRef(null),previousIdeas=useRef(false);
  useEffect(()=>{
    if(ideas)body.current?.querySelector('.vl-filters button[aria-pressed="true"]')?.focus({preventScroll:true});
    else if(previousIdeas.current)ideaTrigger.current?.focus({preventScroll:true});
    if(body.current)body.current.scrollTop=0;
    previousIdeas.current=ideas;
  },[ideas]);
  const content=<div className="vl-dialog vl-create-dialog" ref={body} aria-busy={busy}>
    {shared?<form className="vs-shared-create" onSubmit={e=>{e.preventDefault();create(null);}}><p className="vl-overline">UM ESPAÇO PARA O SEU GRUPO</p><h3>Compartilhem as próximas descobertas</h3><label>Nome da lista<input required maxLength={80} value={metadata.title} onChange={e=>setMetadata(old=>({...old,title:e.target.value}))}/></label><label>Descrição <small>opcional</small><textarea rows={3} maxLength={500} value={metadata.description} onChange={e=>setMetadata(old=>({...old,description:e.target.value}))}/></label><label>Visibilidade<select value={metadata.visibility} onChange={e=>setMetadata(old=>({...old,visibility:e.target.value}))}><option value="public">Pública</option><option value="connections">Só seguidores / amigos</option><option value="private">Privada</option></select></label><ListMediaPicker value={fixedMedia?[fixedMedia]:mediaTypes||allListMedia} onChange={setMediaTypes} disabled={busy||!!fixedMedia}/><p className="vl-muted">Participantes podem adicionar obras e acompanhar seu progresso. Só você altera as configurações da lista.</p><button className="vl-primary" disabled={busy}>Criar e convidar pessoas</button></form>:ideas?<><button type="button" className="vl-create-back" disabled={busy} onClick={()=>setIdeas(false)}><Icon name="arrow-left"/> Voltar</button><ListMediaPicker value={fixedMedia?[fixedMedia]:mediaTypes||allListMedia} onChange={setMediaTypes} disabled={busy||!!fixedMedia}/><IdeaPicker media={fixedMedia} busy={busy} onChoose={create}/></>:<>
      <div className="vl-create-intro"><p className="vl-overline">UM NOVO ESPAÇO PARA SUAS HISTÓRIAS</p><h3>Como você quer começar?</h3><p className="vl-muted">Reúna suas próximas descobertas ou os favoritos de sempre.</p></div>
      <ListMediaPicker value={fixedMedia?[fixedMedia]:mediaTypes||allListMedia} onChange={setMediaTypes} disabled={busy||!!fixedMedia}/><div className="vl-new-options">
        <button type="button" disabled={busy} onClick={()=>create(null)}><span className="vl-new-option-icon"><Icon name="plus"/></span><span className="vl-new-option-copy"><strong>Começar do zero</strong><small>Uma lista vazia, pronta para suas escolhas.</small></span><Icon name="arrow-right" className="vl-new-option-arrow"/></button>
        <button type="button" ref={ideaTrigger} disabled={busy} onClick={()=>setIdeas(true)}><span className="vl-new-option-icon"><Icon name="sparkle"/></span><span className="vl-new-option-copy"><strong>Escolher uma ideia</strong><small>Encontre um tema e dê o seu toque.</small></span><Icon name="arrow-right" className="vl-new-option-arrow"/></button>
      </div>
    </>}
    {!shared&&<p className="vl-create-notice"><Icon name="globe"/> Listas novas são públicas. Você pode mudar a visibilidade no editor.</p>}
    <p className="vl-create-feedback" role="status" aria-live="polite">{busy?'Criando sua lista…':message}</p>
    {inline&&<button type="button" className="vl-create-back" disabled={busy} onClick={onClose}><Icon name="arrow-left"/> Voltar às minhas listas</button>}
  </div>;
  return inline?content:<DetailModal trapFocus title={shared?'Criar lista compartilhada':'Criar lista'} className={ideas?'vl-create-modal vl-create-modal--ideas':'vl-create-modal'} onClose={()=>{if(!busy)onClose();}}>{content}</DetailModal>;
}
