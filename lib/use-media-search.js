import {useEffect,useState} from 'react';
import {publicCatalog} from './public-catalog-client.js';
import {normalizeSearchTerm,SEARCH_DELAY_MS,shortSearch} from './catalog-cache-policy.js';

// All work selectors use the same public request, cancellation and page policy.
// Selections/favorites/list permissions remain in their existing components.
export function useMediaSearch({media,query='',enabled=true}){
  const term=normalizeSearchTerm(query),filterKey=JSON.stringify([media,term]);
  const [paging,setPaging]=useState({key:filterKey,page:1}),[attempt,setAttempt]=useState(0),[state,setState]=useState({});
  const page=paging.key===filterKey?paging.page:1,key=JSON.stringify([filterKey,page,attempt]);
  const tooShort=shortSearch(term);
  useEffect(()=>{
    if(!enabled||tooShort||!media)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setState({key,loading:true});
      try{
        const data=await publicCatalog.request('/api/profile-media-search?'+new URLSearchParams({media,q:term,page:String(page)}),{signal:controller.signal});
        if(!controller.signal.aborted)setState({...data,key,loading:false});
      }catch(error){if(!controller.signal.aborted)setState({key,error:error.message||'Busca indisponível.'});}
    },SEARCH_DELAY_MS);
    return()=>{clearTimeout(timer);controller.abort();};
  },[key,enabled,tooShort,media,term,page]);
  const current=!enabled||!media?{items:[]}:tooShort?{items:[],notice:'Digite pelo menos duas letras para buscar por título.'}:state.key===key?state:{loading:true};
  return {
    results:{items:[],...current},page,
    changePage(next){if(Number.isInteger(next)&&next>=1&&next<=500)setPaging({key:filterKey,page:next});},
    retry(){setAttempt(value=>value+1);},
  };
}
