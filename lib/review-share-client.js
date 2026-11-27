export const REVIEW_SHARE_EVENT='void:share-review';
let pending=null;
export function openReviewShare(id,{automatic=false}={}){if(typeof window==='undefined'||!id||automatic)return;pending={id,automatic:false};setTimeout(()=>window.dispatchEvent(new Event(REVIEW_SHARE_EVENT)),0);}
export function takeShareRequest(){const value=pending;pending=null;return value;}
export async function shareHeaders(client){const {data,error}=client?await client.auth.getSession():{data:{}};if(error)throw Error('Entre novamente para continuar.');return data.session?.access_token?{Authorization:'Bearer '+data.session.access_token}:{};}
