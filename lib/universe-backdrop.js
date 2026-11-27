// TMDB's supported backdrop sizes, keeping the same image identity.
export function movieUniverseSrcSet(source){
  try{
    const url=new URL(source);
    if(url.protocol!=='https:'||url.hostname!=='image.tmdb.org'||!/^\/t\/p\/w(?:780|1280)\//.test(url.pathname))return undefined;
    return [780,1280].map(width=>`${url.href.replace(/\/t\/p\/w(?:780|1280)\//,`/t/p/w${width}/`)} ${width}w`).join(', ');
  }catch{return undefined;}
}
