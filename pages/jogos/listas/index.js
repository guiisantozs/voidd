import Head from 'next/head';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/router';
import Icon from '../../../components/Icon';
import {GamesHeader,GamesFooter} from '../../../components/GameUI';
import {useAccount} from '../../../components/AccountProvider';
import {ListEmpty,ListError,ListSkeleton} from '../../../components/lists/ListUI';
import ListCard from '../../../components/lists/GameListCard';
import NewListDialog,{createInspiredList} from '../../../components/lists/NewListDialog';
import IdeaPicker from '../../../components/lists/IdeaPicker';
import {useLists} from '../../../lib/use-lists';
import {useLibrary} from '../../../lib/use-library';
import {gameWishlist} from '../../../lib/game-wishlist';
import {gameListsSummary} from '../../../lib/game-list-presentation';
import {listError,listsChanged} from '../../../lib/lists';

const tabs=[['mine','Minhas listas'],['discover','Descobrir'],['saved','Salvas']];
export default function GameLists(){
  const {client,user,ready}=useAccount(),router=useRouter(),tab=tabs.some(([key])=>key===router.query.aba)?router.query.aba:'mine';
  const [sort,setSort]=useState('recent'),[following,setFollowing]=useState(false),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const ref=useRef(null),account=useRef(user?.id);account.current=user?.id;
  useEffect(()=>{account.current=user?.id;return()=>{account.current=null;};},[user?.id]);
  const lists=useLists({mode:tab==='discover'&&following?'following':tab,sort,media:'jogos'}),library=useLibrary();
  const wishlist=gameWishlist(library.entries),summary=gameListsSummary(lists.rows,tab==='mine'?wishlist:null),summaryReady=!lists.loading&&!lists.error&&(tab!=='mine'||library.ready&&!library.error);
  function setTab(value){router.push({pathname:'/jogos/listas',query:{aba:value}},undefined,{shallow:true,scroll:false});}
  function keys(event){const index=tabs.findIndex(([key])=>key===tab),next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;if(next<0)return;event.preventDefault();setTab(tabs[next][0]);ref.current?.querySelectorAll('[role=tab]')[next]?.focus();}
  async function choose(idea){if(!user){router.push('/conta');return;}if(busy)return;setBusy(true);setMessage('');const owner=user.id;try{const id=await createInspiredList(client,idea,['jogos']);if(account.current!==owner)return;listsChanged();router.push(`/jogos/listas/${id}?${creating==='shared'?'convidar=1':'editar=1'}`);}catch(error){if(account.current===owner){setMessage(listError(error));setBusy(false);}}}
  return <div className="movies-page games-shell lists-page game-lists-page"><Head><title>Listas de jogos — VOID</title></Head><GamesHeader/><main className="vl-container"><Link className="vl-back" href="/listas/convites">Convites para listas</Link>
    <header className="vl-page-heading game-lists-heading"><div><p className="vl-overline"><Icon name="gamepad"/> SUA PRÓXIMA JORNADA</p><h1>Suas listas. Seu jogo.</h1><p>Organize o backlog, reúna favoritos e descubra novas aventuras.</p></div>{user?<div className="vs-create-actions"><button className="vl-primary" onClick={()=>setCreating('individual')}><Icon name="plus"/> Criar lista</button><button className="vl-primary vs-create-shared" onClick={()=>setCreating('shared')}><Icon name="plus"/> Criar lista compartilhada</button></div>:<Link className="vl-button vl-primary" href="/conta">Entre para criar uma lista</Link>}</header>
    <div className="vgl-hud" aria-label="Resumo da seleção"><p>{lists.has_more?'RESUMO DAS LISTAS CARREGADAS':'NESTA SELEÇÃO'}</p><div>{[['list',summary.lists,'listas'],['gamepad',summary.games,'jogos nas listas'],['users',summary.shared,'colaborativas']].map(([icon,value,label])=><div className="vgl-hud-chip" key={label}><Icon name={icon}/><strong>{summaryReady?(value===null?'—':value):'…'}</strong><span>{label}</span></div>)}</div>{summaryReady&&summary.games===null&&<small>Listas mistas não informam a contagem por mídia.</small>}</div>
    <div className="vl-tabs" role="tablist" aria-label="Listas de jogos" ref={ref} onKeyDown={keys}>{tabs.map(([key,label])=><button key={key} role="tab" id={`vgl-tab-${key}`} aria-controls={`vgl-panel-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}>{label}</button>)}</div>
    <section role="tabpanel" id={`vgl-panel-${tab}`} aria-labelledby={`vgl-tab-${tab}`} tabIndex={0}>
    {tab==='discover'&&<div className="vl-discover-tools"><div className="vl-filters" role="group" aria-label="Ordenar listas"><button aria-pressed={sort==='popular'} onClick={()=>setSort('popular')}>Populares</button><button aria-pressed={sort==='recent'} onClick={()=>setSort('recent')}>Recentes</button></div><button disabled={!user} aria-pressed={following} onClick={()=>setFollowing(value=>!value)}><Icon name="users"/> Pessoas que sigo</button></div>}

    <div className="vl-grid vgl-grid">{tab==='mine'&&<ListCard list={wishlist} basePath="/jogos/listas" editable={false}/>} {(!lists.loading||lists.more)&&lists.rows.map(list=><ListCard key={list.id} list={list} basePath="/jogos/listas"/>)}</div>
    {library.error&&<ListError message={library.error}/>}
    {!ready||lists.loading&&!lists.more?<ListSkeleton/>:tab!=='discover'&&!user?<ListEmpty title="Sua jornada começa aqui">Quero jogar funciona neste navegador. <Link href="/conta">Entre na sua conta</Link> para sincronizar sua biblioteca e criar listas personalizadas.</ListEmpty>:!client?<ListError message="As listas online não estão disponíveis neste ambiente."/>:<>
      {lists.error&&<ListError retry={lists.more?lists.loadMore:lists.refresh}/>}
      {!lists.error&&!lists.rows.length&&<ListEmpty title={tab==='mine'?'Monte sua próxima campanha':tab==='saved'?'Nenhuma lista salva':'Nenhuma lista de jogos encontrada'} action={tab==='mine'?<button className="vl-primary" onClick={()=>setCreating('individual')}><Icon name="plus"/> Criar minha primeira lista</button>:undefined}><Icon name="gamepad"/> {tab==='mine'?'Seu próximo objetivo merece uma lista. Comece do zero ou escolha uma ideia abaixo.':'As listas disponíveis aparecerão aqui.'}</ListEmpty>}
      {lists.has_more&&!lists.error&&<button className="vl-load-more" disabled={lists.loading} onClick={lists.loadMore}>{lists.loading?'Carregando…':'Ver mais listas'}</button>}
    </>}
    {tab==='mine'&&<IdeaPicker media="jogos" compact={lists.rows.length>0} onChoose={choose} busy={busy}/>}
    </section><p role="status" className="vl-feedback">{message}</p>
    </main><GamesFooter/>{creating&&user&&<NewListDialog key={`${user.id}:${creating}`} shared={creating==='shared'} fixedMedia="jogos" onClose={()=>setCreating(false)} onCreated={id=>router.push(`/jogos/listas/${id}?${creating==='shared'?'convidar=1':'editar=1'}`)}/>}</div>;
}
