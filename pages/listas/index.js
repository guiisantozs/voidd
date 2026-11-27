import Head from 'next/head';
import Icon from '../../components/Icon';
import { ListMediaFilter } from '../../components/lists/ListMedia';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../../components/AccountProvider';
import MovieHeader from '../../components/movies/MovieHeader';
import { MovieListProvider,useMovieList } from '../../components/movies/MovieUI';
import { ListCard,ListEmpty,ListError,ListSkeleton } from '../../components/lists/ListUI';
import NewListDialog,{createInspiredList} from '../../components/lists/NewListDialog';
import SeriesWatchlistCard from '../../components/lists/SeriesWatchlistCard';
import IdeaPicker from '../../components/lists/IdeaPicker';
import { useLists } from '../../lib/use-lists';
import { allListMedia,listError,listsChanged } from '../../lib/lists';
const tabs=[['mine','Minhas listas'],['discover','Descobrir'],['saved','Salvas']];
export default function Lists({fixedMedia=null,basePath='/listas',standard=null}){const {user}=useAccount();const content=<ListsContent key={user?.id||'guest'} fixedMedia={fixedMedia} basePath={basePath} standard={standard}/>;return ['series','animes'].includes(fixedMedia)?content:<MovieListProvider key={user?.id||'guest'}>{content}</MovieListProvider>;}
function ListsContent({fixedMedia,basePath,standard}) {
  const {client,user,ready}=useAccount(),router=useRouter(),tab=tabs.some(([key])=>key===router.query.aba)?router.query.aba:'mine';
  const [sort,setSort]=useState('recent'),[discovery,setDiscovery]=useState('all'),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const tabList=useRef(null),account=useRef(user?.id);
  useEffect(()=>{account.current=user?.id;return()=>{account.current=null;};},[user?.id]);
  const media=fixedMedia||(allListMedia.includes(router.query.midia)?router.query.midia:null);
  const mode=tab==='discover'&&discovery==='following'?'following':tab,lists=useLists({mode,sort,media}),watchlist=useMovieList();
  const saved=Object.values(watchlist?.saved||{}),special=standard||{...watchlist?.watchlistSettings.settings,id:'ver-depois',special:true,owner_id:user?.id,item_count:saved.length,cover:saved.slice(0,5)};
  useEffect(()=>{if(router.query.nova==='1'&&user)setCreating(true);},[router.query.nova,user?.id]);
  function setTab(next){router.push({pathname:basePath,query:{...router.query,aba:next}},undefined,{shallow:true,scroll:false});}
  function keys(event){const index=tabs.findIndex(([key])=>key===tab),next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;if(next<0)return;event.preventDefault();setTab(tabs[next][0]);tabList.current?.querySelectorAll('[role=tab]')[next]?.focus();}
  async function choose(idea){if(!user){router.push('/conta');return;}if(busy)return;setBusy(true);setMessage('');try{const owner=user.id,id=await createInspiredList(client,idea,fixedMedia?[fixedMedia]:undefined);if(account.current!==owner)return;listsChanged();router.push(`${basePath}/${id}?editar=1`);}catch(error){setMessage(listError(error));setBusy(false);}}
  return <div className="movies-page lists-page"><Head><title>Listas — VOID</title><meta name="description" content="Reúna filmes, séries, jogos e animes do seu jeito."/></Head><MovieHeader current="listas" seriesOnly={['series','animes'].includes(fixedMedia)} media={fixedMedia||'filmes'}/>
    <main className="vl-container"><Link className="vl-back" href="/listas/convites">Convites para listas</Link><header className="vl-page-heading"><div><h1>{fixedMedia==='animes'?'Listas de animes':fixedMedia==='series'?'Listas de séries':'Listas'}</h1><p>Reúna filmes, séries, jogos e animes do seu jeito.</p></div>{user?<div className="vs-create-actions"><button className="vl-primary" onClick={()=>setCreating('individual')}><Icon name="plus"/> Criar lista</button><button className="vl-primary vs-create-shared" onClick={()=>setCreating('shared')}><Icon name="plus"/> Criar lista compartilhada</button></div>:<Link className="vl-button vl-primary" href="/conta">Entre para criar uma lista</Link>}</header>
    <div className="vl-tabs" role="tablist" aria-label="Explorar listas" ref={tabList} onKeyDown={keys}>{tabs.map(([key,label])=><button key={key} id={`vl-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`vl-panel-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {!fixedMedia&&<ListMediaFilter value={media} onChange={value=>{const query={...router.query};if(value)query.midia=value;else delete query.midia;router.push({pathname:basePath,query},undefined,{shallow:true,scroll:false});}}/>}
    {tabs.map(([key])=><section key={key} id={`vl-panel-${key}`} role="tabpanel" aria-labelledby={`vl-tab-${key}`} tabIndex={0} hidden={tab!==key}>{tab===key&&<>
      {key==='discover'&&<div className="vl-discover-tools"><div className="vl-filters" role="group" aria-label="Ordenar listas"><button aria-pressed={sort==='popular'} onClick={()=>setSort('popular')}>Populares</button><button aria-pressed={sort==='recent'} onClick={()=>setSort('recent')}>Recentes</button></div><button className="vl-following-filter" aria-pressed={discovery==='following'} disabled={!user} onClick={()=>setDiscovery(value=>value==='following'?'all':'following')}><Icon name="users"/> Pessoas que sigo</button></div>}
      {key==='mine'&&<div className="vl-grid">{(!media||media==='filmes'||['series','animes'].includes(fixedMedia))&&<ListCard list={special} basePath={basePath}/>}{!fixedMedia&&(!media||media==='series')&&<SeriesWatchlistCard/>}{!fixedMedia&&(!media||media==='animes')&&<SeriesWatchlistCard media="animes"/>}{(!lists.loading||lists.more)&&lists.rows.map(list=><ListCard key={list.id} list={list} basePath={fixedMedia?basePath:undefined}/>)}</div>}
      {!ready||lists.loading&&!lists.more?<ListSkeleton/>:!client?<ListError message="As listas online não estão disponíveis neste ambiente."/>:key!=='discover'&&!user?<ListEmpty title="Entre para acessar suas listas"><Link href="/conta">Entre na sua conta</Link> para criar e salvar listas. Ver depois continua disponível neste navegador.</ListEmpty>:<>
        {lists.error&&<ListError retry={lists.more?lists.loadMore:lists.refresh}/>}
        {key!=='mine'&&<div className="vl-grid">{lists.rows.map(list=><ListCard key={list.id} list={list} basePath={fixedMedia?basePath:undefined}/>)}</div>}
        {!lists.error&&!lists.rows.length&&<ListEmpty title={key==='mine'?'Você ainda não criou nenhuma lista':key==='saved'?'Nenhuma lista salva':'Nenhuma lista encontrada'} action={key==='mine'?<button className="vl-primary" onClick={()=>setCreating(true)}><Icon name="plus"/> Nova lista</button>:null}>{key==='mine'?'Comece do zero ou use uma das ideias abaixo.':key==='saved'?'Salve listas de outras pessoas para encontrá-las aqui.':'As listas públicas disponíveis aparecerão aqui.'}</ListEmpty>}
        {lists.has_more&&!lists.error&&<button className="vl-load-more" disabled={lists.loading} onClick={lists.loadMore}>{lists.loading?'Carregando…':'Ver mais listas'}</button>}
      </>}
      {key==='mine'&&(!lists.loading||lists.more)&&!lists.error&&<IdeaPicker media={fixedMedia} compact={lists.rows.length>0} onChoose={choose} busy={busy}/>}
    </>}</section>)}<p role="status" className="vl-feedback">{message}</p></main>{creating&&user&&<NewListDialog fixedMedia={fixedMedia} onCreated={id=>router.push(`${basePath}/${id}?${creating==='shared'?'convidar=1':'editar=1'}`)} shared={creating==='shared'} onClose={()=>{setCreating(false);if(router.query.nova)router.replace(basePath,undefined,{shallow:true});}}/>}
  </div>;
}
