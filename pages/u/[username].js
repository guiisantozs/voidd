import { useEffect,useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../../components/AccountProvider';
import PublicProfile from '../pessoas/[id]';
import { normalizeUsername,usernameValid,profileHref } from '../../lib/usernames';
export default function UsernameProfile(){
  const router=useRouter(),{client}=useAccount();const [state,setState]=useState({}),[retry,setRetry]=useState(0);const name=normalizeUsername(router.query.username);
  useEffect(()=>{const refresh=()=>setRetry(n=>n+1);window.addEventListener('void:identity-changed',refresh);return()=>window.removeEventListener('void:identity-changed',refresh);},[]);
  useEffect(()=>{if(!client||!router.isReady)return;let active=true;setState({});if(!usernameValid(name)){setState({missing:true});return;}client.rpc('void_people_resolve',{handle:name}).then(({data,error})=>{if(!active)return;if(error){setState({error:true});return;}if(!data){setState({missing:true});return;}setState({person:data});if(data.username!==name)router.replace(profileHref(data));}).catch(()=>{if(active)setState({error:true});});return()=>{active=false;};},[name,client,router.isReady,retry]);
  if(state.person)return <PublicProfile profileId={state.person.user_id}/>;
  return <main className="review-page"><h1>{state.missing?'Perfil não encontrado':state.error?'Não foi possível abrir esse perfil':'Carregando perfil…'}</h1>{state.error&&<button onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button>}</main>;
}
