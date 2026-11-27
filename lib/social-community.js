import {safeAvatarReturn} from './avatars.js';
export const SOCIAL_EVENT='void:social-changed';
export function socialChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(SOCIAL_EVENT));}
export async function socialRpc(client,name,args={},signal){let request=client.rpc(name,args);if(signal)request=request.abortSignal(signal);const {data,error}=await request;if(error)throw error;return data;}
export function socialError(error){
 if(error?.message?.includes('INVITE_COOLDOWN'))return 'Aguarde sete dias para convidar essa pessoa novamente.';
 if(error?.message?.includes('RATE_LIMIT'))return 'Muitas ações em pouco tempo. Aguarde antes de tentar novamente.';
 if(error?.message?.includes('INVALID_INVITE'))return 'Este convite foi desativado ou não está disponível para sua conta.';
 if(error?.code==='42501')return 'Esta ação não está disponível para sua conta ou conexão atual.';
 return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
export function safeSocialReturn(value){
 if(typeof value!=='string')return null;
 if(/^\/listas\/convite\?token=[a-f0-9]{64}$/.test(value)||/^\/listas\/convites(?:\?lista=[a-f0-9-]{36})?$/.test(value))return value;
 return safeAvatarReturn(value);
}
