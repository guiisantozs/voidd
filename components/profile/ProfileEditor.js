import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../AccountProvider';
import DetailModal from '../movies/DetailModal';
import Icon from '../Icon';
import { profileFormValid } from '../../lib/profile';
import { prepareAvatar, saveProfileWithAvatar } from '../../lib/profile-images';
import { ProfileAvatar } from './ProfileUI';
import ProfileBannerPicker from './ProfileBannerPicker';
import UsernameField from './UsernameField';
import DisplayNameField from './DisplayNameField';
import { usernameError } from '../../lib/usernames';
import ProfileAvatars from '../avatars/ProfileAvatars';

export default function ProfileEditor({profile,onClose,onSaved}) {
  const {client,user}=useAccount();
  const [form,setForm]=useState({display_name:profile.display_name||'',username:profile.username||'',bio:profile.bio||'',avatar_url:profile.avatar_url||'',banner_url:profile.banner_url||'',visibility:profile.visibility||'public'});
  const [busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[message,setMessage]=useState(''),[photo,setPhoto]=useState(null),[preview,setPreview]=useState('');
  const mounted=useRef(true),selection=useRef(0);
  const [usernameStatus,setUsernameStatus]=useState('idle'),[usernameCheck,setUsernameCheck]=useState(0);
  const [nameStatus,setNameStatus]=useState('idle');
  const [photoTab,setPhotoTab]=useState('photo');
  const unlocks=profile.username_changed_at?new Date(new Date(profile.username_changed_at).getTime()+30*86400000):null;
  const cooldown=!!unlocks&&unlocks.getTime()>Date.now();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;selection.current++;};},[]);
  useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
  const change=(key,value)=>setForm(old=>({...old,[key]:value}));
  async function choosePhoto(event) {
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const token=++selection.current;setPreparing(true);setPhoto(null);setMessage('');
    try {const blob=await prepareAvatar(file);if(mounted.current&&token===selection.current)setPhoto(blob);}
    catch(error){if(mounted.current&&token===selection.current)setMessage(error.message||'Não foi possível preparar a foto.');}
    finally{if(mounted.current&&token===selection.current)setPreparing(false);}
  }
  async function save(event) {
    event.preventDefault();if(busy||preparing||!user||!client)return;
    if(!profileFormValid(form)||usernameStatus!=='available'||nameStatus==='prohibited'){setMessage('Este nome não pode ser utilizado. Escolha outro nome para continuar.');return;}
    setBusy(true);setMessage('');
    try {
      const identity=await saveProfileWithAvatar({client,userId:user.id,form,photo,previousAvatar:profile.avatar_url,baseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL});
      window.dispatchEvent(new CustomEvent('void:identity-changed',{detail:identity}));onSaved(identity);onClose();
    } catch(error) {
      if(mounted.current){setMessage(error?.message?.includes('NAME_PROHIBITED')||error?.code==='23505'||error?.code==='23514'?usernameError(error):error?.cause?error.message:'Não foi possível salvar o perfil ou enviar a foto. Tente novamente.');setUsernameCheck(n=>n+1);}
    } finally {if(mounted.current)setBusy(false);}
  }
  return <DetailModal className="va-editor-modal" title="Editar seu perfil" onClose={()=>{if(!busy)onClose();}}><form className="vp-editor" onSubmit={save}><fieldset className="vp-editor-fields" disabled={busy}><p className="vp-muted">Deixe seu universo com a sua cara.</p>
    <div className="va-photo-tabs" role="tablist" aria-label="Imagem do perfil" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'photo':event.key==='End'?'avatars':photoTab==='photo'?'avatars':'photo';setPhotoTab(next);document.getElementById(`va-photo-tab-${next}`)?.focus();}}>{[['photo','Minha foto'],['avatars','Avatares']].map(([key,label])=><button type="button" key={key} id={`va-photo-tab-${key}`} role="tab" aria-selected={photoTab===key} aria-controls={`va-photo-panel-${key}`} tabIndex={photoTab===key?0:-1} onClick={()=>setPhotoTab(key)}>{label}</button>)}</div>
    <div id="va-photo-panel-photo" role="tabpanel" aria-labelledby="va-photo-tab-photo" hidden={photoTab!=='photo'}><section className="vp-avatar-editor" aria-label="Foto de perfil"><div className="vp-avatar-preview">{preview?<img src={preview} alt="Prévia da nova foto de perfil"/>:<ProfileAvatar profile={{...profile,user_id:undefined,avatar_url:form.avatar_url}}/>}</div><div><label className="vp-upload-label">Foto de perfil <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={preparing}/></label><p className="vp-muted">JPG, PNG ou WebP, até 20 MB. Qualquer proporção: recorte central e redução automática para até 512 × 512 px e 1 MB.</p>{(photo||form.avatar_url)&&<button type="button" className="vp-text-button" disabled={preparing} onClick={()=>{selection.current++;setPhoto(null);change('avatar_url','');}}>Remover foto</button>}<p role="status">{preparing?'Preparando sua foto…':photo?'Nova foto pronta. Salve para aplicar.':''}</p></div></section></div>
    <div id="va-photo-panel-avatars" role="tabpanel" aria-labelledby="va-photo-tab-avatars" hidden={photoTab!=='avatars'}>{photoTab==='avatars'&&<ProfileAvatars onSaved={onSaved}/>}</div>
    <DisplayNameField value={form.display_name} onChange={value=>change('display_name',value)} onStatus={setNameStatus} disabled={busy}/><p className="vp-muted">Pode se repetir e aceita espaços e acentos. O @ abaixo é seu identificador único.</p><UsernameField key={usernameCheck} value={form.username} current={profile.username} onChange={value=>change('username',value)} disabled={busy||cooldown} onStatus={setUsernameStatus}/><p className="vp-muted">{cooldown?`Você poderá alterar seu @ em ${unlocks.toLocaleDateString('pt-BR')}.`:'Você pode alterar seu @ uma vez a cada 30 dias.'} O anterior fica reservado para você por 30 dias.</p><label>Bio <textarea maxLength={240} rows={3} value={form.bio} onChange={e=>change('bio',e.target.value)}/></label>
    <ProfileBannerPicker value={form.banner_url} onChange={value=>change('banner_url',value)}/>
    <label>Quem pode ver seu perfil? <select value={form.visibility} onChange={e=>change('visibility',e.target.value)}><option value="public">Público</option><option value="followers">Só seguidores</option><option value="private">Privado</option></select></label><p className="vp-muted">“Só seguidores” permite acesso a quem seguir você, sem aprovação. Reviews privadas continuam privadas. Sem foto, usamos sua inicial.</p>
    <div className="vp-editor-footer"><button className="vp-primary" disabled={busy||preparing||usernameStatus!=='available'||nameStatus==='prohibited'}>{busy?'Salvando…':'Salvar perfil'} <Icon name="check"/></button><button type="button" onClick={onClose}>Cancelar</button></div></fieldset><p role="status" aria-live="polite">{message}</p></form></DetailModal>;
}
