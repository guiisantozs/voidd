import MovieHeader from '../../components/movies/MovieHeader';
import ProfileDiary from '../../components/profile/ProfileDiary';
import ProfileActivity from '../../components/profile/ProfileActivity';
import ProfileWall from '../../components/profile/ProfileWall';
import ProfileHighlights from '../../components/profile/ProfileHighlights';
import { profileHref } from '../../lib/usernames';
import Icon from '../../components/Icon';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect,useRef,useState } from 'react';
import { useAccount } from '../../components/AccountProvider';
import ProfileEditor from '../../components/profile/ProfileEditor';
import ProfileConnections from '../../components/profile/ProfileConnections';
import ProfileFavorites from '../../components/profile/ProfileFavorites';
import ProfileReviews from '../../components/profile/ProfileReviews';
import ProfileStats from '../../components/profile/ProfileStats';
import ProfileGamePresence from '../../components/profile/ProfileGamePresence';
import { GamerJourney } from '../../components/games/GameCollection';
import ProfileLists from '../../components/lists/ProfileLists';
import FollowButton from '../../components/profile/FollowButton';
import { ProfileAvatar,ProfileReviewCard,ProfileSkeleton,ProfileError } from '../../components/profile/ProfileUI';
import { useRouteTab } from '../../lib/use-route-tab';
import { profileTabs,profileIdValid } from '../../lib/profile';
import { profileBanner } from '../../lib/profile-banner';

function ProfileContent({target}){
  const {client,user}=useAccount();const [state,setState]=useState({loading:true}),[revision,setRevision]=useState(0),[modal,setModal]=useState(null),[message,setMessage]=useState(''),[bannerFailed,setBannerFailed]=useState(false);const tabList=useRef(null);const [tab,setTab]=useRouteTab(profileTabs.map(([key])=>key),'overview');
  const refresh=()=>setRevision(n=>n+1);
  function profileSaved(identity){setState(old=>({...old,data:{...old.data,profile:{...old.data?.profile,...identity}}}));refresh();}
  useEffect(()=>{if(!client){setState({error:true});return;}let active=true;setState(old=>({...old,loading:true,error:false}));client.rpc('void_profile_overview_v2',{target}).then(({data,error})=>{if(active)setState(error?{error:true}:{data});}).catch(()=>{if(active)setState({error:true});});return()=>{active=false;};},[client,target,user?.id,revision]);
  const data=state.data,profile=data?.profile,owner=user?.id===target;
  const banner=profileBanner(profile?.banner_url);
  const joinedAt=profile?.joined_at||(owner?user?.created_at:null);
  useEffect(()=>setBannerFailed(false),[profile?.banner_url]);
  function setReviews(){setTab('reviews');requestAnimationFrame(()=>{document.getElementById('vp-tab-reviews')?.focus();tabList.current?.scrollIntoView({block:'start'});});}
  function tabKeys(event){const index=profileTabs.findIndex(([key])=>key===tab);const next=event.key==='ArrowRight'?(index+1)%profileTabs.length:event.key==='ArrowLeft'?(index+profileTabs.length-1)%profileTabs.length:event.key==='Home'?0:event.key==='End'?profileTabs.length-1:-1;if(next<0)return;event.preventDefault();setTab(profileTabs[next][0]);tabList.current?.querySelectorAll('[role="tab"]')[next]?.focus();}
  async function share(){try{await navigator.clipboard.writeText(`${window.location.origin}${profileHref(profile)}`);setMessage('Link do perfil copiado.');}catch{setMessage(`Copie o endereço do seu perfil: ${window.location.origin}${profileHref(profile)}`);}}
  return <><Head><title>{profile?.display_name?`${profile.display_name} — VOID`:'Perfil — VOID'}</title><meta name="description" content="Favoritos, avaliações e histórias compartilhadas no VOID."/></Head>{state.error?<main className="vp-container vp-page-error"><h1>Não conseguimos carregar este perfil</h1><ProfileError retry={refresh}/></main>:!data?<main className="vp-container"><ProfileSkeleton/></main>:data.locked||data.notFound?<main className="vp-container vp-locked"><span aria-hidden="true"><Icon name="diamond" /></span><h1>Este universo está reservado</h1><p>O perfil está privado ou disponível apenas para seguidores.</p><FollowButton target={target} following={data.following} onChanged={refresh}/>{!user&&<p className="vp-muted">Entre para ver perfis compartilhados com seguidores.</p>}</main>:<>
    <div className={`vp-banner ${banner.source&&!bannerFailed?'vp-banner-cinema':''}`}>{banner.source&&!bannerFailed?<img src={banner.source} style={{objectPosition:`${banner.x}% ${banner.y}%`}} alt="" decoding="async" fetchPriority="high" onError={()=>setBannerFailed(true)}/>:<><div className="vp-banner-orbit" aria-hidden="true"/><span className="vp-banner-word" aria-hidden="true">VOID</span></>}</div>
    <main className="vp-container"><section className="vp-header"><ProfileAvatar profile={profile}/><div className="vp-identity"><span className="vp-kicker">UM UNIVERSO DE HISTÓRIAS</span><h1>{profile.display_name}</h1><p className="vp-username">@{profile.username}</p>{profile.bio&&<p className="vp-bio">{profile.bio}</p>}<p className="vp-joined">{joinedAt?<>No VOID desde {new Date(joinedAt).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</>:'Seu próximo capítulo começa aqui'}{owner&&<span> · {({public:'Perfil público',followers:'Só seguidores',private:'Perfil privado'})[profile.visibility]}</span>}{!owner&&data.is_friend&&<span> · Amigos</span>}</p></div><div className="vp-profile-actions">{owner?<><button onClick={()=>setModal('edit')}>Editar perfil</button><button className="vp-share" onClick={share}><Icon name="arrow-up-right" />{" Compartilhar perfil"}</button><Link href="/conta">Configurações da conta</Link></>:<FollowButton target={target} following={data.following} onChanged={refresh}/>}</div></section><p role="status" className="vp-feedback">{message}{state.loading?' Atualizando…':''}</p>
    <div className="vp-counters">{[['reviews','avaliações'],['followers','seguidores'],['following','seguindo'],['friends','amigos']].map(([key,label])=><button key={key} onClick={()=>key==='reviews'?setReviews():setModal(key)}><strong>{data.counts[key]}</strong><span>{label}</span></button>)}</div>
    <div className="vp-tabs" role="tablist" aria-label="Seções do perfil" ref={tabList} onKeyDown={tabKeys}>{profileTabs.map(([key,name])=><button key={key} id={`vp-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`vp-panel-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}>{name}{!['overview','reviews','lists','diary','activity','wall','games','achievements'].includes(key)&&<span>Em breve</span>}</button>)}</div>
    {profileTabs.map(([key,name])=><section key={key} id={`vp-panel-${key}`} aria-labelledby={`vp-tab-${key}`} role="tabpanel" tabIndex={0} hidden={key!==tab}>{tab===key&&(key==='overview'?<>{owner&&<ProfileGamePresence target={target}/>}<ProfileHighlights target={target} owner={owner}/><ProfileFavorites favorites={data.favorites} owner={owner} onSaved={refresh}/><section className="vp-section"><div className="vp-section-title"><h2>As últimas histórias</h2><button onClick={setReviews}>{"Ver todas "}<Icon name="arrow-up-right" /></button></div>{data.recent.length?<div className="vp-recent-grid">{data.recent.map(row=><ProfileReviewCard key={row.item_key} row={row} owner={target}/>)}</div>:<div className="vp-empty"><h3>Nenhuma avaliação ainda</h3><p>Os filmes, jogos e histórias que passarem por aqui vão deixar suas marcas.</p>{owner&&<Link href="/filmes">{"Encontre sua próxima história "}<Icon name="arrow-up-right" /></Link>}</div>}</section><ProfileStats data={data} owner={owner}/></>:key==='games'?<GamerJourney target={target}/>:key==='achievements'?<GamerJourney target={target} achievements/>:key==='diary'?<ProfileDiary target={target}/>:key==='activity'?<ProfileActivity target={target}/>:key==='wall'?<ProfileWall target={target}/>:key==='reviews'?<ProfileReviews target={target}/>:key==='lists'?<ProfileLists target={target} owner={owner}/>:<div className="vp-coming-soon"><span aria-hidden="true"><Icon name="diamond" /></span><h2>{name}</h2><p>Em breve, mais um espaço para suas histórias no VOID.</p></div>)}</section>)}
    </main>{modal==='edit'&&owner&&<ProfileEditor profile={profile} onClose={()=>setModal(null)} onSaved={profileSaved}/>} {['followers','following','friends'].includes(modal)&&<ProfileConnections target={target} type={modal} onClose={()=>setModal(null)} onChanged={refresh}/>}
  </>}</>;
}

export default function PublicProfile({profileId}={}){const router=useRouter();const {user}=useAccount();const target=profileId||router.query.id;return <div className="movies-page movie-detail void-profile"><MovieHeader current="perfil"/>{!router.isReady?<main className="vp-container"><ProfileSkeleton/></main>:profileIdValid(target)?<ProfileContent key={`${target}:${user?.id||'guest'}`} target={target}/>:<main className="vp-container vp-page-error"><h1>Perfil não encontrado</h1><Link href="/filmes">Voltar ao VOID</Link></main>}<footer className="vp-container vp-footer"><Link className="logo" href="/">void<span><Icon name="dot" /></span></Link><p>Histórias diferentes. Um universo em comum.</p><Link href="/filmes">{"Explorar o VOID "}<Icon name="arrow-up-right" /></Link></footer></div>;}
