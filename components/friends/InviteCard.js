import Link from 'next/link';
import Icon from '../Icon';
import { useEffect,useState } from 'react';
import { personalInviteUrl } from '../../lib/friend-invites';
import { CircleSkeleton } from './FriendsUI';

export default function InviteCard({user,profile,loading}) {
  const [showQr,setShowQr]=useState(false),[url,setUrl]=useState(''),[qr,setQr]=useState(''),[qrError,setQrError]=useState(false),[feedback,setFeedback]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{setFeedback('');setUrl(profile?.username?personalInviteUrl(window.location.origin,profile.username):'');},[profile?.username,user?.id]);
  useEffect(()=>{
    let active=true;setQr('');setQrError(false);if(!url||!showQr)return;
    import('qrcode').then(module=>(module.default||module).toDataURL(url,{width:168,margin:4,errorCorrectionLevel:'M',color:{dark:'#241533',light:'#ffffff'}})).then(value=>{if(active)setQr(value);}).catch(()=>{if(active)setQrError(true);});
    return()=>{active=false;};
  },[url,retry,showQr]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),3000);return()=>clearTimeout(timer);},[feedback]);
  async function copy(){try{await navigator.clipboard.writeText(url);setFeedback('Link copiado!');}catch{setFeedback('Não foi possível copiar. Selecione o link acima.');}}
  return <section className="circle-panel circle-invite-card"><p className="circle-kicker">UMA HISTÓRIA PARA COMPARTILHAR</p><h2>Convide amigos</h2><p className="circle-muted">Traga quem compartilha suas paixões. A amizade começa com um convite.</p>{loading?<CircleSkeleton self/>:!user?<Link className="circle-edit-link" href="/conta">Entre para criar seu convite</Link>:!profile?.username?<p className="circle-muted">Escolha seu @ no perfil para compartilhar um convite.</p>:url&&<><label className="circle-sr-only" htmlFor="personal-invite-link">Seu link de convite</label><input id="personal-invite-link" className="circle-invite-url" readOnly value={url} onFocus={e=>e.target.select()}/><button className="circle-primary circle-load-more" onClick={copy}>Copiar link</button><a className="circle-edit-link" href={`https://wa.me/?text=${encodeURIComponent(`Vem fazer parte do meu círculo no Void! Filmes, avaliações e novas descobertas: ${url}`)}`} target="_blank" rel="noopener noreferrer">Compartilhar no WhatsApp <Icon name="arrow-up-right"/></a><button className="circle-edit-link" aria-expanded={showQr} onClick={()=>setShowQr(value=>!value)}>{showQr?'Ocultar QR code':'Mostrar QR code'}</button>{showQr&&<div className="circle-qr">{qr?<img src={qr} width="168" height="168" alt="QR code do seu convite pessoal para o Void"/>:qrError?<><p>Não foi possível gerar o QR code.</p><button onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></>:<span className="m-skeleton" role="status" aria-label="Gerando QR code"/>}</div>}<p className="circle-copy-feedback" role="status" aria-live="polite">{feedback}</p><p className="circle-muted">Quem entrar pelo link poderá enviar um pedido. Você decide quando aceitar.</p></>}</section>;
}
