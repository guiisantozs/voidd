import { useEffect, useId, useState } from 'react';
import { useAccount } from '../AccountProvider';
import { usernameValid, normalizeUsername } from '../../lib/usernames';

export default function UsernameField({value,onChange,current='',disabled=false,onStatus}) {
  const {client}=useAccount();const id=useId();
  const [result,setResult]=useState({}),[retry,setRetry]=useState(0);
  const valid=usernameValid(value);
  const status=!value?'idle':!valid?'invalid':value===current?'available':result.key===value?result.status:'checking';
  useEffect(()=>{onStatus?.(status);},[status,onStatus]);
  useEffect(()=>{
    if(!valid||value===current||disabled)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{if(!client)throw Error('CONFIG');const {data,error}=await client.rpc('void_username_check',{candidate:value}).abortSignal(controller.signal);if(error)throw error;if(!controller.signal.aborted)setResult({key:value,status:data});}
      catch(error){if(!controller.signal.aborted)setResult({key:value,status:error.message?.includes('RATE_LIMIT')?'limited':'error'});}
    },400);
    return()=>{clearTimeout(timer);controller.abort();};
  },[client,value,current,valid,disabled,retry]);
  const message={idle:'Escolha seu identificador único.',invalid:'Formato inválido ou nome reservado.',prohibited:'Este nome não pode ser utilizado. Escolha outro nome para continuar.',checking:'Verificando disponibilidade…',available:value===current?'Este é seu @ atual.':'Disponível',taken:'Já em uso ou reservado.',cooldown:'Você só pode alterar seu @ uma vez a cada 30 dias.',limited:'Muitas buscas. Aguarde um minuto.',error:'Não foi possível verificar. Tente novamente.'}[status];
  return <div className="void-username-field"><label htmlFor={id}>@usuário <input id={id} type="text" required minLength={3} maxLength={20} autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} value={value} disabled={disabled} onChange={e=>{setResult({});onChange(normalizeUsername(e.target.value));}} aria-describedby={`${id}-rules ${id}-status`} aria-invalid={['invalid','taken'].includes(status)||undefined}/></label><small id={`${id}-rules`}>3–20 caracteres. Letras, números, ponto ou underline. Comece e termine com letra ou número; não repita separadores.</small><p id={`${id}-status`} className={`void-username-status is-${status}`} role="status" aria-live="polite">{message}</p>{['error','limited'].includes(status)&&<button type="button" onClick={()=>{setResult({});setRetry(n=>n+1);}}>Verificar novamente</button>}</div>;
}
