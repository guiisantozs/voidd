export const JIKAN_RETIRED_MESSAGE='A API pública da Jikan foi encerrada. O catálogo de animes precisa de uma instância própria ou de outro provedor autorizado.';
export function jikanEndpoint(value){
 if(!value)throw Object.assign(Error(JIKAN_RETIRED_MESSAGE),{code:'JIKAN_RETIRED',status:503});
 let url;try{url=new URL(value);}catch{throw Error('CONFIG');}
 if(url.hostname==='api.jikan.moe')throw Object.assign(Error(JIKAN_RETIRED_MESSAGE),{code:'JIKAN_RETIRED',status:503});
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw Error('CONFIG');
 return url.href.replace(/\/+$/,'');
}
