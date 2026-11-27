import Icon from '../Icon';
import Link from 'next/link';
import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import DetailModal from '../movies/DetailModal';
import {useAccount} from '../AccountProvider';
import {useLists} from '../../lib/use-lists';
import {listError,listsChanged,setListItem} from '../../lib/lists';
import {ListError} from './ListUI';
import NewListDialog from './NewListDialog';
import {useLibrary} from '../../lib/use-library';
import {useSeriesWatchlist} from '../../lib/use-series-watchlist';
import {useWatchlistSettings} from '../../lib/use-watchlist-settings';

const visibilityLabel={public:'Pública',connections:'Só conexões',private:'Privada'};
function SeriesStandardOption({list,busy,item}){
 const {settings}=useWatchlistSettings(item.categoria);
 return <label className="vl-save-option vl-save-standard"><span className="vl-save-option-icon"><Icon name="monitor"/></span><span className="vl-save-option-copy"><strong>{settings.title}</strong><small>Lista padrão · {visibilityLabel[settings.visibility]}</small></span><input type="checkbox" disabled={!list.ready||busy||!!list.error} checked={!!list.saved[item.id]} onChange={event=>list.set(item,event.target.checked)}/></label>;
}
export function ListPicker({item,watchlist}){
 const series=useSeriesWatchlist(item.categoria==='animes'?'animes':'series');
 const library=useLibrary(),gameEntry=library.entries[String(item.id)],gameSaved=gameEntry?.status==='want';
 const {client,user}=useAccount(),lists=useLists({watchChanges:false,media:item.categoria==='filmes'?null:item.categoria}),[checked,setChecked]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[creating,setCreating]=useState(false),[retry,setRetry]=useState(0),[checking,setChecking]=useState(false),[checkError,setCheckError]=useState(false),generation=useRef(0),lock=useRef(false);
 const ids=lists.rows.map(list=>list.id).join(','),versions=lists.rows.map(list=>list.updated_at).join('|'),box=useRef(null),moreFocus=useRef(null);
 const scope=`${user?.id||'guest'}:${item.categoria}:${item.id}`,current=useRef(scope);current.current=scope;
 useEffect(()=>{current.current=scope;setBusy(false);setMessage('');lock.current=false;return()=>{current.current=null;generation.current++;};},[scope]);
 useEffect(()=>{
  const token=++generation.current;setChecked(null);setCheckError(false);setChecking(false);if(!client||!user||!ids)return;const abort=new AbortController();setChecking(true);
  client.from('list_items').select('list_id').in('list_id',ids.split(',')).eq('media_type',item.categoria).eq('external_id',String(item.id)).abortSignal(abort.signal).then(({data,error})=>{
   if(abort.signal.aborted||generation.current!==token)return;if(error)throw error;setChecked(new Set(data.map(row=>row.list_id)));setChecking(false);
   const firstNew=moreFocus.current;if(firstNew!==null&&lists.rows.length>firstNew){moreFocus.current=null;requestAnimationFrame(()=>{if(document.activeElement===document.body)box.current?.querySelectorAll('.vl-save-custom input')[firstNew]?.focus({preventScroll:true});});}
  }).catch(()=>{if(!abort.signal.aborted&&generation.current===token){setCheckError(true);setChecking(false);}});
  return()=>abort.abort();
 },[client,user?.id,ids,versions,item.id,item.categoria,retry]);
 async function toggle(id,present){
  if(lock.current)return;const owner=current.current,token=generation.current;lock.current=true;setBusy(true);setMessage('');
  try{await setListItem(client,id,item,present);if(current.current===owner){if(generation.current===token)setChecked(old=>{const next=new Set(old);if(present)next.add(id);else next.delete(id);return next;});else setRetry(n=>n+1);setMessage(present?'Obra adicionada à lista.':'Obra removida da lista.');listsChanged();}}
  catch(error){if(current.current===owner)setMessage(listError(error));}finally{lock.current=false;if(current.current===owner)setBusy(false);}
 }
 if(creating)return <NewListDialog fixedMedia={item.categoria==='filmes'?null:item.categoria} inline onClose={()=>setCreating(false)}/>;
 const standard=watchlist?.watchlistSettings?.settings;
 return <div className="vl-dialog vl-picker vl-save-picker" ref={box}><div className="vl-save-work"><span><Icon name={item.categoria==='filmes'?'film':'list'}/></span><div><strong>{item.titulo}</strong><p>Escolha uma ou mais listas.</p></div></div><div className="vl-save-options">
 {item.categoria==='filmes'&&watchlist&&<label className="vl-save-option vl-save-standard"><span className="vl-save-option-icon"><Icon name="clock"/></span><span className="vl-save-option-copy"><strong>{standard?.title||'Ver depois'}</strong><small>Lista padrão · {visibilityLabel[standard?.visibility]||'Privada'}</small></span><input type="checkbox" disabled={!watchlist.ready||busy} checked={!!watchlist.saved[item.id]} onChange={()=>watchlist.toggle(item)}/></label>}
 {['series','animes'].includes(item.categoria)&&<SeriesStandardOption list={series} busy={busy} item={item}/>}
 {item.categoria==='jogos'&&<label className="vl-save-option vl-save-standard"><span className="vl-save-option-icon"><Icon name="gamepad"/></span><span className="vl-save-option-copy"><strong>Quero jogar</strong><small>Lista padrão · Privada{gameEntry&&!gameSaved?' · Outro status na biblioteca':''}</small></span><input type="checkbox" checked={gameSaved} disabled={!library.ready||busy||!!gameEntry&&!gameSaved} onChange={()=>library.update(item,gameSaved?'':'want')}/></label>}
 {!user?<p><Link href="/conta">Entre na sua conta</Link> para criar listas personalizadas.</p>:<>
 <h3>Suas listas e colaborações</h3>{lists.loading&&!lists.more?<div className="vl-save-skeleton" role="status" aria-label="Carregando listas">{[0,1].map(i=><div className="m-skeleton" key={i}/>)}</div>:lists.error?<ListError retry={lists.refresh}/>:<>
 {!lists.rows.length&&<p className="vl-muted">Crie uma lista para organizar suas próximas escolhas.</p>}
 <div className="vl-save-custom">{lists.rows.map(list=><label className="vl-save-option" key={list.id}><span className="vl-save-option-icon"><Icon name="list"/></span><span className="vl-save-option-copy"><strong>{list.title}</strong><small>{visibilityLabel[list.visibility]||'Lista personalizada'}{checked?.has(list.id)?' · Adicionado':''}</small></span><input type="checkbox" disabled={checked===null} aria-disabled={busy} checked={checked?.has(list.id)||false} onChange={e=>toggle(list.id,e.target.checked)}/></label>)}</div>
 {checking&&<p className="vl-muted" role="status">Conferindo onde esta obra já está salva…</p>}{checkError&&<ListError message="Não foi possível conferir as listas." retry={()=>setRetry(n=>n+1)}/>}
 {lists.has_more&&<button className="vl-save-more" aria-disabled={lists.loading} disabled={busy} onClick={()=>{if(!lists.loading){moreFocus.current=lists.rows.length;lists.loadMore();}}}>{lists.loading?'Carregando…':'Ver mais listas'}</button>}</>}
 <button className="vl-save-create" disabled={busy} onClick={()=>setCreating(true)}><Icon name="plus"/> Criar nova lista <Icon name="arrow-right"/></button>
 </>}</div><p className="vl-save-feedback" role="status" aria-live="polite">{(['series','animes'].includes(item.categoria)&&series.error)||(item.categoria==='jogos'&&library.error)||(busy?'Salvando seleção…':message)}</p></div>;
}

export function ListPickerDialog({item,watchlist,onClose}){
 const {user}=useAccount();
 return createPortal(<DetailModal title="Salvar em uma lista" className="vl-save-dialog" onClose={onClose}><ListPicker key={`${user?.id||'guest'}:${item.categoria}:${item.id}`} item={item} watchlist={watchlist}/></DetailModal>,document.body);
}
