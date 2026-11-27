import {useEffect,useState} from 'react';
import Icon from '../Icon';
import {MovieFailure} from '../movies/MovieUI';
const regions=[['BR','Brasil'],['PT','Portugal'],['US','Estados Unidos'],['GB','Reino Unido'],['ES','Espanha'],['FR','França'],['CA','Canadá']];
export default function WatchProviders({id}){
 const [region,setRegion]=useState('BR'),[state,setState]=useState({loading:true}),[revision,setRevision]=useState(0);
 useEffect(()=>{try{const saved=localStorage.getItem('void:watch-region:v1');if(regions.some(([key])=>key===saved))setRegion(saved);}catch{/* Optional preference. */}},[]);
 useEffect(()=>{const controller=new AbortController();setState({loading:true});fetch(`/api/series-detail?id=${id}&part=providers&region=${region}`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.erro);if(!controller.signal.aborted)setState(data);}).catch(()=>{if(!controller.signal.aborted)setState({error:true});});return()=>controller.abort();},[id,region,revision]);
 const country=regions.find(([key])=>key===region)?.[1]||region;
 return <section className="sd-providers"><h2><Icon name="play"/> Onde assistir</h2><label className="sd-region">Região <select value={region} onChange={event=>{setRegion(event.target.value);try{localStorage.setItem('void:watch-region:v1',event.target.value);}catch{}}}>{regions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  {state.loading?<div className="sd-provider-skeleton m-skeleton" role="status" aria-label="Carregando onde assistir"/>:state.error?<MovieFailure message="Não foi possível consultar os serviços agora." retry={()=>setRevision(value=>value+1)}/>:!state.groups?.length?<p className="md-muted">Ainda sem informação de onde assistir {region==='BR'?'no Brasil':`em ${country}`}.</p>:state.groups.map(group=><div key={group.key} className="sd-provider-group"><h3>{group.label}</h3><div>{group.providers.map(provider=>state.link?<a key={provider.id} href={state.link} target="_blank" rel="noopener noreferrer">{provider.logo&&<img src={provider.logo} width="24" height="24" alt="" loading="lazy"/>}{provider.name}</a>:<span key={provider.id}>{provider.logo&&<img src={provider.logo} width="24" height="24" alt="" loading="lazy"/>}{provider.name}</span>)}</div></div>)}
  <small className="sd-attribution">Disponibilidade fornecida pelo JustWatch via TMDB.</small>
 </section>;
}
