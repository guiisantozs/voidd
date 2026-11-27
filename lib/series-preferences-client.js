export async function seriesPrivateRequest(client,owner,path,{signal,ids,fetcher=fetch}={}){
 const {data,error}=await client.auth.getSession(),session=data?.session;
 if(error||!owner||session?.user?.id!==owner||!session.access_token)throw Error('Sua sessão mudou. Entre novamente para continuar.');
 const response=await fetcher(path,{method:ids?'POST':'GET',signal,cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`,...(ids?{'Content-Type':'application/json'}:{})},...(ids?{body:JSON.stringify({ids})}:{})});
 const result=await response.json();
 if(!response.ok)throw Error(result.erro||'Não foi possível carregar suas preferências. Tente novamente.');
 return result;
}
