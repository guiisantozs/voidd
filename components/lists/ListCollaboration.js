import {useMediaSearch} from '../../lib/use-media-search';
import MediaSearchPagination from '../MediaSearchPagination';
import {profileHref} from '../../lib/usernames';
import Link from 'next/link';
import {useRouter} from 'next/router';
import ListInvitePanel from './ListInvitePanel';
import {useCallback,useEffect,useRef,useState} from 'react';
import Icon from '../Icon';
import {useAccount} from '../AccountProvider';
import ListParticipantLink from './ListParticipantLink';
import {ProfilePoster} from '../profile/ProfileUI';
import DetailModal from '../movies/DetailModal';
import GameCover from '../GameCover';
import {collaborationRpc,collaborationSummary} from '../../lib/list-collaboration';
import {listError,listItemKey,listMedia,listsChanged,setListItem} from '../../lib/lists';
import {formatRating} from '../../lib/catalog';
import {workHref} from '../../lib/work-client';
import {DATA_EVENT} from '../../lib/account-storage';

export default function ListCollaboration({list,onChange,basePath='/listas'}){
  const {client,user}=useAccount(),[state,setState]=useState({loading:true}),[modal,setModal]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const live=useRef(true),lock=useRef(false),changed=useRef(onChange);changed.current=onChange;
  const owner=list.owner_id===user?.id,router=useRouter();
  useEffect(()=>{if(owner&&router.query.convidar==='1')setModal({invite:true});},[owner,router.query.convidar]);
  const refresh=useCallback(async()=>{
    if(!client||!user){setState({data:{}});return;}
    try{const data=await collaborationRpc(client,'void_list_social',{target:list.id});if(live.current)setState({data});}
    catch{if(live.current)setState({error:true});}
  },[client,user?.id,list.id]);
  useEffect(()=>{
    live.current=true;refresh();
    const reconcile=()=>{if(document.visibilityState!=='hidden'){refresh();changed.current();}};
    const timer=setInterval(reconcile,15000);
    window.addEventListener('focus',reconcile);window.addEventListener('online',reconcile);window.addEventListener(DATA_EVENT,reconcile);
    let channel=client?.channel(`list-collaboration:${list.id}:${user?.id||'guest'}`);
    if(channel){for(const table of ['list_items','list_members','list_progress'])channel=channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`list_id=eq.${list.id}`},reconcile);channel=channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'lists',filter:`id=eq.${list.id}`},reconcile).subscribe();}
    return()=>{live.current=false;clearInterval(timer);window.removeEventListener('focus',reconcile);window.removeEventListener('online',reconcile);window.removeEventListener(DATA_EVENT,reconcile);if(channel)client.removeChannel(channel);};
  },[refresh,client,list.id,user?.id]);
  useEffect(()=>{refresh();},[list.updated_at,refresh]);
  const data=state.data||{},summary=collaborationSummary(list.items,data),participant=summary.people.some(p=>p.user_id===user?.id);
  const people=data.participants||[],authors=new Map((list.item_authors||[]).map(i=>[listItemKey(i),i.added_by]));
  async function act(operation,success){
    if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
    try{await operation();if(live.current){setMessage(success);await refresh();changed.current();listsChanged();}}
    catch(error){if(live.current)setMessage(listError(error));}
    finally{lock.current=false;if(live.current)setBusy(false);}
  }
  const invite=(person,action)=>act(()=>collaborationRpc(client,'void_list_invitation',{target:list.id,person,action}),action==='invite'?'Convite enviado.':'Participação atualizada.');
  const selected=summary.works.find(w=>w.key===modal?.work),entry=list.items.find(i=>listItemKey(i)===modal?.work);
  return <section className="vc-section" aria-label="Colaboração da lista">
    <div className="vc-heading"><div><p className="vl-overline">UMA LISTA, VÁRIAS HISTÓRIAS</p><h2>Juntos na próxima descoberta</h2><p className="vl-muted">Organize escolhas e acompanhe o progresso do grupo.</p></div><div className="vc-actions">{participant&&<div className="vc-avatars">{summary.people.slice(0,5).map(p=><ListParticipantLink key={p.user_id} person={p} avatarOnly/>)}<button className="vc-people-toggle" onClick={()=>setModal({people:true})} aria-label={`Ver ${summary.people.length} participantes`}>{summary.people.length>5?`+${summary.people.length-5}`:`${summary.people.length} ${summary.people.length===1?'participante':'participantes'}`}</button></div>}{owner&&<button className="vl-primary" onClick={()=>setModal({invite:true})}><Icon name="users"/> Convidar pessoas</button>}{participant&&<button onClick={()=>setModal({add:true})}><Icon name="plus"/> Adicionar obras</button>}</div></div>
    {state.loading?<p role="status">Carregando o grupo…</p>:state.error?<p role="alert">Não foi possível carregar o grupo. <button onClick={refresh}>Tentar novamente</button></p>:participant?<div className="vc-progress-panel"><div className="vc-progress-summary"><div><span>Progresso coletivo</span><strong>{summary.percent}<small>%</small></strong></div><span>{summary.done} de {summary.total} conclusões compartilhadas</span><progress max={summary.total||1} value={summary.done} aria-label={`Progresso coletivo: ${summary.percent}%`}/><small>{list.items.length} obras · {summary.people.length} participantes · {summary.unanimous} concluídas por todos</small></div><div className="vc-person-progress">{summary.people.map(p=><div key={p.user_id}><ListParticipantLink person={p}><small>{p.completed}/{list.items.length} concluídas</small></ListParticipantLink><progress max={list.items.length||1} value={p.completed} aria-label={`Progresso de ${p.display_name}`}/></div>)}</div><p className="vc-privacy">Notas seguem a privacidade de cada perfil e avaliação. Apenas conclusões compartilhadas e avaliações visíveis entram neste resumo.</p></div>:<p className="vc-privacy">Os detalhes do grupo estão disponíveis para os participantes. Você pode visualizar as obras conforme a privacidade da lista.</p>}
    <p className="vl-feedback" role="status" aria-live="polite">{busy?'Salvando…':message}</p>
    {!list.items.length?<div className="vl-empty"><h3>A primeira escolha é de vocês</h3><p>Adicione uma obra para começar a jornada do grupo.</p></div>:<ol className="vc-work-grid">{list.items.map((entry,index)=>{
      const key=listItemKey(entry),work=summary.works[index],item={...entry.snapshot,id:entry.external_id,categoria:entry.media_type},author=people.find(p=>p.user_id===authors.get(key));
      return <li key={key}><article className="vc-work-card"><Link className="vc-poster" href={workHref(item)} aria-label={`Abrir ${item.titulo}`}>{item.categoria==='jogos'?<GameCover item={item}/>:<ProfilePoster item={item}/>}</Link><div className="vc-work-body"><h3><Link href={workHref(item)}>{list.ranked?`${index+1}. `:''}{item.titulo}</Link></h3><small>{item.ano} · {listMedia.find(([m])=>m===item.categoria)?.[2]}</small><p className="vc-added">Adicionado por {author?<Link href={profileHref(author.user_id)}>{author.display_name||'um participante'}</Link>:authors.get(key)===list.owner_id?<Link href={profileHref(list.owner_id)}>{list.display_name}</Link>:'um participante'}</p>{participant&&<button className="vc-work-progress" onClick={()=>setModal({work:key})} aria-label={`Ver progresso do grupo em ${item.titulo}`}><span><Icon name="users"/> {work.watched} de {work.total} concluíram</span><progress max={work.total||1} value={work.watched}/><span><Icon name="star"/> {work.average===null?'Sem notas compartilhadas':`${formatRating(work.average)} média do grupo`}</span></button>}{entry.note&&<p className="vc-note">{entry.note}</p>}<div className="vc-actions">{participant&&<Link href={{pathname:'/avaliar',query:{categoria:item.categoria,id:item.id,lista:`${basePath}/${list.id}`}}}>Avaliar</Link>}{participant&&(owner||authors.get(key)===user.id)&&<button disabled={busy} aria-label={`Remover ${item.titulo} da lista`} onClick={()=>act(()=>setListItem(client,list.id,item,false),'Obra removida. As avaliações pessoais foram preservadas.')}><Icon name="minus"/> Remover</button>}</div></div></article></li>;
    })}</ol>}
    {modal&&<DetailModal title={modal.invite?'Convidar pessoas':modal.add?'Adicionar obras':modal.people?'Participantes':entry?.snapshot.titulo||'Progresso'} trapFocus className={`vc-modal${modal.add?' vc-add-modal':''}`} onClose={()=>{if(!busy)setModal(null);}}><div className="vc-modal-body">
      {modal.invite&&owner&&<ListInvitePanel key={user.id} list={list} onChanged={()=>{refresh();changed.current();}}/>}
      {modal.people&&<><ul className="vc-people">{people.map(p=><li key={p.user_id}><ListParticipantLink person={p}><small>{p.owner?'Proprietário':p.status==='pending'?'Convite pendente':`Entrou em ${new Date(p.joined_at).toLocaleDateString('pt-BR')}`}</small></ListParticipantLink>{owner&&!p.owner&&<button disabled={busy} onClick={()=>invite(p.user_id,p.status==='pending'?'cancel':'remove')}>{p.status==='pending'?'Cancelar convite':'Remover'}</button>}{!owner&&p.user_id===user?.id&&<button disabled={busy} onClick={()=>invite(p.user_id,'leave')}>Sair da lista</button>}</li>)}</ul></>}
      {modal.add&&participant&&<AddCollaborativeWork list={list} busy={busy} add={item=>act(()=>setListItem(client,list.id,item,true),'Obra adicionada à lista.')}/>}
      {selected&&<><p className="vc-privacy">Avaliações privadas não são publicadas ao participar da lista.</p><ul className="vc-people">{selected.participants.map(p=><li key={p.user_id}><ListParticipantLink person={p}><small><Icon name={p.completed?'check':'clock'}/> {p.completed?'Concluiu':'Pendente'} · {p.rating===null?'Sem nota compartilhada':`${formatRating(p.rating)} / 5`}</small></ListParticipantLink>{p.user_id===user?.id&&<button disabled={busy||p.rating!==null} onClick={()=>act(()=>collaborationRpc(client,'void_list_complete',{target:list.id,media:entry.media_type,external:entry.external_id,present:!p.manual}),p.manual?'Conclusão desmarcada.':'Conclusão compartilhada com o grupo.')}>{p.rating!==null?'Já avaliado':p.manual?'Desmarcar':'Marcar como concluído'}</button>}</li>)}</ul><p className="vl-muted">Marcar como concluído não cria avaliação. Uma avaliação existente é editada pela página da obra.</p></>}
      <p role="status" aria-live="polite">{busy?'Salvando…':message}</p>
    </div></DetailModal>}
  </section>;
}

function AddCollaborativeWork({list,busy,add}){
  const [media,setMedia]=useState(list.media_types?.[0]||'filmes'),[query,setQuery]=useState('');
  const search=useMediaSearch({media,query}),state=search.results;
  const mediaName=listMedia.find(([key])=>key===media)?.[2]||'Obra';
  return <section className="vl-work-search vc-add-search">
    <div className="vc-add-intro"><span className="vc-add-symbol"><Icon name="list"/></span><div><p>QUAL VAI SER A PRÓXIMA HISTÓRIA?</p><h3>Encontre uma nova escolha</h3><span>Busque no catálogo e adicione à sua lista.</span></div></div>
    <div className="vl-field-row vc-add-fields"><label>Mídia<select value={media} onChange={e=>setMedia(e.target.value)}>{listMedia.filter(([m])=>list.media_types.includes(m)).map(([m,,label])=><option key={m} value={m}>{label}</option>)}</select></label><label>Buscar obra<span className="vc-add-input"><Icon name="search"/><input type="search" maxLength={80} value={query} placeholder="Digite o título da obra..." onChange={e=>setQuery(e.target.value)}/></span></label></div>
    {state.loading?<div className="vc-add-loading" role="status" aria-label="Buscando obras"><span>Buscando obras...</span><div>{Array.from({length:4},(_,i)=><div className="vc-add-skeleton" key={i}><i/><span><i/><i/></span></div>)}</div></div>:state.error?<div className="vc-add-state" role="alert"><Icon name="search"/><h4>Não conseguimos buscar agora</h4><p>Tente novamente para encontrar sua próxima obra.</p><button type="button" onClick={search.retry}>Tentar novamente <Icon name="arrow-right"/></button></div>:<>
    {state.notice&&<p className="vc-add-notice">{state.notice}</p>}
    <div className="vc-add-results-heading"><span>{query.trim()?'Resultados da busca':'Explore o catálogo'}</span><small>{list.items.length}/200 na lista</small></div>
    <div className="vl-work-results vc-add-results">{state.items?.map(item=>{const added=list.items.some(i=>listItemKey(i)===listItemKey(item));return <button type="button" key={`${item.categoria}:${item.id}`} className={added?'is-added':undefined} disabled={busy||list.items.length>=200||added} aria-label={`${added?'Já adicionado:':'Adicionar'} ${item.titulo}`} onClick={()=>add(item)}><ProfilePoster item={item}/><span className="vc-add-result-copy"><strong>{item.titulo}</strong><small>{item.ano||mediaName}{added?' · Na lista':''}</small></span><span className="vc-add-result-action"><Icon name={added?'check':'plus'}/></span></button>;})}</div><MediaSearchPagination search={search}/>
    {!state.items?.length&&<div className="vc-add-state"><Icon name="search"/><h4>Nenhuma obra encontrada</h4><p>Tente outro título ou escolha uma mídia diferente.</p></div>}
    </>}
    <p className="vc-add-footnote"><Icon name="plus"/> Selecione uma obra para adicionar à lista.</p>
  </section>;
}
