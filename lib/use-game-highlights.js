import {useEffect,useRef,useState} from 'react';
import {fetchGameHome,gameHomeNextRefresh,readGameHomeSnapshot,storeGameHomeSnapshot,validGameHomeSnapshot} from './game-home-client';

export function useGameHighlights() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ games: [], loading: true });
  const saved=useRef(null);
  useEffect(() => {
    const controller = new AbortController();let active=true,timer,running=false,due=0;
    let storage;try{storage=window.localStorage;}catch{/* Storage is optional. */}
    let current=validGameHomeSnapshot(saved.current)?saved.current:readGameHomeSnapshot(storage);
    if(current)setState({...current,loading:false});
    function schedule(when){due=when;clearTimeout(timer);timer=setTimeout(()=>load(),Math.max(1000,when-Date.now()));}
    async function load(force=false){
      if(!active||running)return;
      if(!force&&due>Date.now()){schedule(due);return;}
      if(document.visibilityState==='hidden'){schedule(Date.now()+60000);return;}
      running=true;setState(old=>current?{...old,refreshing:true}:{games:[],loading:true});
      try {
        const data=await fetchGameHome({signal:controller.signal});
        if(active){current=data;saved.current=data;storeGameHomeSnapshot(storage,data);setState({...data,loading:false,...(data.stale||data.refreshAt<=Date.now()?{refreshError:'Exibindo a última seleção disponível enquanto a atualização está indisponível.'}:{})});schedule(gameHomeNextRefresh(data));}
      }catch(error){if(active){setState(current?{...current,loading:false,refreshError:'A atualização está indisponível. Mantivemos a última seleção disponível.'}:{games:[],loading:false,error:error.message});schedule(Date.now()+300000);}}
      finally{running=false;}
    }
    if(current&&current.refreshAt>Date.now()&&!attempt)schedule(current.refreshAt);else load(true);
    const resume=()=>{if(Date.now()>=due)load();};const online=()=>load(true);
    window.addEventListener('focus',resume);window.addEventListener('online',online);document.addEventListener('visibilitychange',resume);
    return()=>{active=false;clearTimeout(timer);controller.abort();window.removeEventListener('focus',resume);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',resume);};
  }, [attempt]);
  return { state, retry: () => setAttempt(value => value + 1) };
}
