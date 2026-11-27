import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import DetailModal from '../movies/DetailModal';
import {MovieImage} from '../movies/MovieUI';
import Icon from '../Icon';
import {publicCatalog,SEARCH_DELAY_MS} from '../../lib/public-catalog-client.js';
import MediaSearchPagination from '../MediaSearchPagination';

export default function SeriesPreferences({items=[],onClose,onSave,busy,error,editing=false,media='series'}){
 const [selected,setSelected]=useState(items),[query,setQuery]=useState(''),[results,setResults]=useState([]),[loading,setLoading]=useState(false),[issue,setIssue]=useState(''),[retry,setRetry]=useState(0);
 const [history,setHistory]=useState(['1:0']),[next,setNext]=useState(null);
 const cursor=history[history.length-1];
 const search=useRef(null);
 useEffect(()=>{
  const controller=new AbortController(),term=query.trim();setIssue('');setResults([]);setNext(null);
  if(term.length<2){setLoading(false);return()=>controller.abort();}
  setLoading(true);
  const timer=setTimeout(async()=>{try{
   const data=await publicCatalog.request(`/api/${media}/search?`+new URLSearchParams({q:term,cursor}),{signal:controller.signal});
   const today=new Date().toISOString().slice(0,10);if(!controller.signal.aborted){setResults((data.movies||[]).filter(s=>s.estreia&&s.estreia<=today));setNext(data.next);}
  }catch{if(!controller.signal.aborted)setIssue('A busca está indisponível. Tente novamente.');}finally{if(!controller.signal.aborted)setLoading(false);}},SEARCH_DELAY_MS);
  return()=>{controller.abort();clearTimeout(timer);};
 },[query,retry,cursor]);
 const pages={results:{loading,error:issue,pagination:{hasNext:!!next}},page:history.length,changePage(page){if(page===history.length+1&&next)setHistory(old=>[...old,next]);else if(page>=1&&page<history.length)setHistory(old=>old.slice(0,page));}};
 function toggle(item){setSelected(old=>old.some(s=>String(s.id)===String(item.id))?old.filter(s=>String(s.id)!==String(item.id)):old.length<3?[...old,item]:old);}
 return createPortal(<DetailModal id="series-preferences" title={media==='animes'?'Quais são os 3 animes de que você mais gosta?':'Quais são as 3 séries que você mais gosta?'} onClose={onClose} className="series-taste-modal" backdropClassName="series-taste-backdrop" initialFocusRef={search} inertBackground trapFocus ariaDescribedBy="series-taste-description">
  <p id="series-taste-description" className="series-taste-description">Escolha três obras que você já assistiu e gostou. Vamos encontrar novas histórias que combinam com você.</p>
  {editing&&items.length!==3&&<p className="series-taste-description" role="status">Algumas escolhas estão indisponíveis no catálogo. Substitua-as antes de salvar. Suas preferências atuais serão mantidas até a confirmação.</p>}
  <div className="series-taste-selected">{[0,1,2].map(index=>{const item=selected[index];return <div className={`series-taste-slot ${item?'is-selected':''}`} key={index}>{item?<><MovieImage movie={item}/><div><strong>{item.titulo}</strong><span>{item.ano}</span><button type="button" disabled={busy} onClick={()=>toggle(item)} aria-label={`Remover ${item.titulo}`}>Remover <Icon name="close"/></button></div></>:<><span className="series-taste-slot-number" aria-hidden="true">0{index+1}</span><span>Sua escolha</span></>}</div>;})}</div>
  <div className="series-taste-search"><label htmlFor="series-taste-query">Busque uma obra</label><div><Icon name="search"/><input id="series-taste-query" ref={search} value={query} onChange={e=>{setQuery(e.target.value);setHistory(['1:0']);}} placeholder="Nome da obra…" autoComplete="off" disabled={busy}/></div></div>
  <p className="series-taste-counter" role="status">{selected.length}/3 selecionadas{selected.length===3?' · Remova uma escolha para trocar de série.':''}</p>
  <div className="series-taste-results" aria-busy={loading}>
   {loading?<p role="status">Buscando títulos…</p>:issue?<p role="alert">{issue} <button type="button" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></p>:results.length?results.map(item=>{const chosen=selected.some(s=>String(s.id)===String(item.id));return <button className="series-taste-result" key={item.id} type="button" aria-pressed={chosen} disabled={busy||(!chosen&&selected.length===3)} onClick={()=>toggle(item)}><div><MovieImage movie={item}/>{chosen&&<span>Selecionada</span>}</div><strong>{item.titulo}</strong><small>{item.ano}</small></button>;}):<p>{query.trim().length<2?'Digite pelo menos duas letras para encontrar suas obras favoritas.':'Nenhuma obra encontrada. Tente outro nome.'}</p>}
  </div>
  <MediaSearchPagination search={pages}/><div className="series-taste-footer">{error&&<p role="alert">{error}</p>}<small>Escolhas privadas da sua conta. Nenhuma avaliação será criada.</small><div><button type="button" onClick={onClose}>{editing?'Cancelar':'Agora não'}</button><button className="series-taste-submit" type="button" disabled={selected.length!==3||busy} onClick={()=>onSave(selected.map(item=>item.id))}>{busy?'Salvando…':editing?'Salvar preferências':'Continuar'} <Icon name="arrow-right"/></button></div></div>
 </DetailModal>,document.body);
}
