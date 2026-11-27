import Head from 'next/head';
import PeopleSuggestions from '../components/social/PeopleSuggestions';
import BlockedPeople from '../components/social/BlockedPeople';
import {socialChanged} from '../lib/social-community';
import Link from 'next/link';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../components/AccountProvider';
import MovieHeader from '../components/movies/MovieHeader';
import Icon from '../components/Icon';
import { PeopleSearch } from '../components/profile/PeopleSearch';
import FollowButton from '../components/profile/FollowButton';
import { CircleSkeleton,CircleEmpty,CirclePerson,YourCircleCard } from '../components/friends/FriendsUI';
import FriendCard from '../components/friends/FriendCard';
import FriendFeed from '../components/friends/FriendFeed';
import InviteCard from '../components/friends/InviteCard';
import { filteredFriends } from '../lib/friend-activity';
import { useFriendActivity } from '../lib/use-friend-activity';
import { changeInvitation,connectionTime,friendTab,friendTabs,removeFriend } from '../lib/friends';
import { useFriends } from '../lib/use-friends';

export default function Amigos() {
  const {user,client,ready,ownProfile}=useAccount();const router=useRouter();
  const connections=useFriends(),data=connections.data;
  const tab=friendTab(router.query.aba),tabs=useRef(null);
  const activity=useFriendActivity(true,connections.revision,tab==='amigos'&&!!data);
  const latest=useMemo(()=>Object.fromEntries(activity.rows.map(row=>[row.user_id,row])),[activity.rows]);
  const [filter,setFilter]=useState(''),[order,setOrder]=useState('recent');
  const friends=useMemo(()=>filteredFriends(data?.amigos||[],latest,filter,order),[data,latest,filter,order]);
  const [shown,setShown]=useState(12);
  useEffect(()=>setShown(12),[tab,filter,order,user?.id]);
  const [celebration,setCelebration]=useState(null),[now,setNow]=useState(Date.now);
  const owner=user?.id;
  useEffect(()=>{if(router.isReady&&router.query.aba!==tab)router.replace({pathname:'/amigos',query:{...router.query,aba:tab}},undefined,{shallow:true,scroll:false});},[router.isReady,router.query.aba,tab]);
  useEffect(()=>{setCelebration(null);setFilter('');setOrder('recent');},[owner]);
  useEffect(()=>{if(!celebration)return;const timer=setTimeout(()=>setCelebration(null),4000);return()=>clearTimeout(timer);},[celebration]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  function selectTab(next){router.push({pathname:'/amigos',query:{...router.query,aba:next}},undefined,{shallow:true,scroll:false});}
  function tabKeys(event){const index=friendTabs.findIndex(([key])=>key===tab);const next=event.key==='ArrowRight'?(index+1)%4:event.key==='ArrowLeft'?(index+3)%4:event.key==='Home'?0:event.key==='End'?3:-1;if(next<0)return;event.preventDefault();selectTab(friendTabs[next][0]);tabs.current?.querySelectorAll('[role=tab]')[next]?.focus();}
  function invite(target){return connections.run(target,async()=>{const {error}=await client.from('void_friendships').insert({sender:owner,recipient:target});if(error)throw error;},'Convite enviado. Agora é só esperar a resposta.');}
  async function invitation(person,action){const success=await connections.run(person.user_id,()=>changeInvitation(client,owner,person,action),action==='accept'?'Convite aceito.':action==='decline'?'Convite recusado.':'Convite cancelado.');if(success&&action==='accept')setCelebration({owner,person});}
  const block=person=>connections.run(person.user_id,async()=>{const {error}=await client.from('user_blocks').insert({blocker_id:owner,blocked_id:person.user_id});if(error)throw error;socialChanged();},'Contato bloqueado.');
  const remove=useCallback(person=>connections.run(person.user_id,()=>removeFriend(client,owner,person),'Amizade removida.'),[connections.run,client,owner]);
  function disabledInvite(target){return !!connections.busy||!data||data.amigos.some(person=>person.user_id===target)||data.friendships.some(row=>row.sender===target||row.recipient===target);}
  const counts=data?.counts,celebrating=celebration&&celebration.owner===owner?celebration.person:null;
  const empty={amigos:['Você ainda não tem amigos por aqui','Encontre alguém pelo @, siga de volta ou envie seu primeiro convite.'],seguidores:['Seu círculo ainda vai crescer','Quando alguém seguir você, essa pessoa vai aparecer aqui.'],seguindo:['Quem vai inspirar sua próxima descoberta?','Busque um @ acima e comece a seguir pessoas com quem você quer compartilhar histórias.']};
  return <div className="movies-page friends-page"><Head><title>Amigos — VOID</title><meta name="description" content="Encontre seu círculo no Void: amigos, seguidores e convites em um só lugar."/></Head><MovieHeader current="amigos"/>
    <main><section className="circle-hero"><div className="circle-container circle-hero-inner"><div><p className="circle-kicker">AS MELHORES HISTÓRIAS TÊM COMPANHIA</p><h1>Encontre seu <em>círculo.</em></h1><p>As mesmas paixões. Novas perspectivas. Pessoas para descobrir o próximo favorito com você.</p></div><div className="circle-stats" aria-label="Suas conexões">{friendTabs.map(([key,label])=><button key={key} disabled={!user} onClick={()=>selectTab(key)} aria-label={`${key==='convites'?'Convites recebidos pendentes':label}: ${counts?.[key]??'carregando'}. Abrir aba.`} aria-pressed={tab===key}><strong>{!ready||connections.loading?<span className="circle-stat-skeleton m-skeleton" aria-hidden="true"/>:counts?.[key]??'—'}</strong><span>{key==='convites'?'Convites pendentes':label}</span></button>)}</div></div></section>
    <div className="circle-container circle-layout"><aside className="circle-sidebar"><YourCircleCard key={owner||'guest'} user={user} profile={ownProfile||data?.people[owner]} loading={!ready||!!user&&!ownProfile&&connections.loading}/><InviteCard key={`invite:${owner}`} user={user} profile={ownProfile} loading={!ready}/><FriendFeed key={`feed:${owner}`} user={user} revision={connections.revision} now={now}/></aside>
      <div className="circle-main"><section className="circle-panel circle-search"><div className="circle-section-heading"><span className="circle-heading-icon"><Icon name="search"/></span><div><p className="circle-kicker">UM @ PODE COMEÇAR UMA BOA CONVERSA</p><h2>Encontre pessoas</h2></div></div><PeopleSearch onInvite={invite} inviteDisabled={disabledInvite} refreshKey={connections.revision||0}/></section>
      {user&&<PeopleSuggestions key={owner} revision={connections.revision} onInvite={invite} busy={connections.busy} unavailable={[...(data?.amigos||[]).map(p=>p.user_id),...(data?.seguindo||[]).map(p=>p.user_id),...(data?.friendships||[]).map(f=>f.sender===owner?f.recipient:f.sender)]}/>}
      <section className="circle-panel circle-connections"><div className="circle-tabs" role="tablist" aria-label="Suas conexões" ref={tabs} onKeyDown={tabKeys}>{friendTabs.map(([key,label])=><button key={key} id={`circle-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`circle-panel-${key}`} tabIndex={tab===key?0:-1} disabled={!ready||!user} onClick={()=>selectTab(key)}>{label}<span className={key==='convites'&&counts?.convites?'circle-invite-badge':''}>{counts?.[key]??'—'}</span></button>)}</div>
      <div className="circle-announcements" role="status" aria-live="polite" aria-atomic="true">{connections.message}</div>
        {ready&&user&&connections.error&&<div className="circle-error" role="alert"><p>Não foi possível atualizar suas conexões. {data?'As últimas informações carregadas continuam abaixo.':'Confira sua conexão e tente novamente.'}</p><button onClick={connections.refresh}>Tentar novamente</button></div>}
        {friendTabs.map(([key,label])=><div key={key} id={`circle-panel-${key}`} role="tabpanel" aria-labelledby={`circle-tab-${key}`} hidden={tab!==key} tabIndex={0} aria-busy={!!connections.loading}>{tab===key&&(!ready||connections.loading?<CircleSkeleton/>:!user?<CircleEmpty icon="user" title="Seu círculo está esperando por você"><Link href="/conta">Entre na sua conta</Link> para seguir pessoas, enviar convites e fazer novas amizades.</CircleEmpty>:data&&<>
          <div className="circle-list-heading"><h2>{label}</h2>{connections.refreshing&&<span role="status">Atualizando…</span>}</div>
          {key==='convites'?<div className="circle-invitations"><section aria-labelledby="circle-received"><h3 id="circle-received">Recebidos <span>{data.received.length}</span></h3>{celebrating&&<CirclePerson person={celebrating} celebrating><span className="circle-celebration" role="status"><Icon name="check"/> Vocês agora são amigos</span></CirclePerson>}{!data.received.length&&!celebrating?<CircleEmpty icon="mail" title="Nenhum convite por enquanto">Quando alguém quiser entrar no seu círculo, o convite aparece aqui.</CircleEmpty>:data.received.slice(0,shown).map(person=><CirclePerson key={person.user_id} person={person} meta={<time dateTime={person.created_at}>{connectionTime(person.created_at,now)}</time>}><button className="circle-primary" disabled={!!connections.busy} onClick={()=>invitation(person,'accept')}>Aceitar</button><button disabled={!!connections.busy} onClick={()=>invitation(person,'decline')}>Recusar</button></CirclePerson>)}</section>
          <section aria-labelledby="circle-sent"><h3 id="circle-sent">Enviados <span>{data.sent.length}</span></h3>{!data.sent.length?<CircleEmpty icon="arrow-up-right" title="Seu próximo convite pode começar aqui">Busque alguém pelo @ e dê o primeiro passo.</CircleEmpty>:data.sent.slice(0,shown).map(person=><CirclePerson key={person.user_id} person={person} meta={<time dateTime={person.created_at}>{connectionTime(person.created_at,now)}</time>}><button disabled={!!connections.busy} onClick={()=>invitation(person,'cancel')}>Cancelar</button></CirclePerson>)}</section></div>:<>
          {key==='amigos'?<>
            <div className="circle-friend-tools"><label>Buscar nos amigos<input type="search" placeholder="Nome ou @" value={filter} onChange={e=>setFilter(e.target.value)}/></label><label>Ordenar por<select value={order} onChange={e=>setOrder(e.target.value)}><option value="recent">Atividade recente</option><option value="az">A–Z</option></select></label></div>
            {activity.error&&<div className="circle-error" role="alert"><p>As últimas avaliações não puderam ser carregadas. Seus amigos continuam disponíveis.</p><button onClick={activity.refresh}>Tentar novamente</button></div>}
            <span className="circle-sr-only" role="status" aria-live="polite">{friends.length} amigos encontrados.</span>
            {!friends.length?<CircleEmpty title={filter?'Nenhum amigo encontrado':empty.amigos[0]}>{filter?'Tente outro nome ou @.':empty.amigos[1]}</CircleEmpty>:<ul className="circle-person-list">{friends.slice(0,shown).map(person=><li key={person.user_id}><FriendCard person={person} review={latest[person.user_id]} loading={activity.loading} error={activity.error} busy={!!connections.busy} onRemove={remove} onBlock={block} now={now}/></li>)}</ul>}
          </>:!data[key].length?<CircleEmpty title={empty[key][0]}>{empty[key][1]}</CircleEmpty>:<ul className="circle-person-list">{data[key].slice(0,shown).map(person=><li key={person.user_id}><CirclePerson person={person}><FollowButton target={person.user_id} following={person.following} followLabel={key==='seguidores'?'Seguir de volta':'Seguir'} followingLabel="Deixar de seguir" disabled={!!connections.busy}/></CirclePerson></li>)}</ul>}
          </>}
          {(key==='amigos'?friends.length:key==='convites'?Math.max(data.received.length,data.sent.length):data[key].length)>shown&&<button className="circle-load-more" onClick={()=>setShown(count=>count+12)}>Mostrar mais pessoas</button>}
        </>)}</div>)}
      </section><BlockedPeople key={`blocks:${owner}`} revision={connections.revision}/></div>
    </div></main>
    <footer className="circle-container circle-footer"><Link href="/filmes">Cada história fica melhor quando é compartilhada. <Icon name="arrow-up-right"/></Link><span>Seu círculo, do seu jeito.</span></footer>
  </div>;
}
