import { useEffect, useState } from 'react';
const cache=new Map();
export function useGamerMetadata(games=[]) {
 const ids=[...new Set(games.map(game=>game.rawg_id).filter(id=>/^[1-9][0-9]{0,9}$/.test(String(id))))].sort((a,b)=>Number(a)-Number(b));
 const scope=ids.join(','),[state,setState]=useState({scope:'',items:{},loading:false,partial:false});
 useEffect(()=>{
  const controller=new AbortController(),items={};
  const missing=ids.filter(id=>{const entry=cache.get(String(id));if(entry&&entry.expires>Date.now()){items[id]=entry.value;return false;}return true;});
  setState({scope,items:{...items},loading:missing.length>0,partial:false});
  async function load(){let partial=false;for(let offset=0;offset<missing.length;offset+=8){try{const response=await fetch('/api/gamer-profile-media?'+new URLSearchParams({ids:missing.slice(offset,offset+8).join(',')}),{signal:controller.signal});const data=await response.json();if(!response.ok)throw Error('UNAVAILABLE');partial=partial||!!data.partial;for(const item of data.items||[]){items[item.rawg_id]=item;cache.set(String(item.rawg_id),{value:item,expires:Date.now()+3600000});}}catch{if(controller.signal.aborted)return;partial=true;}}if(!controller.signal.aborted)setState({scope,items:{...items},loading:false,partial});}
  if(missing.length)load();return()=>controller.abort();
 },[scope]);
 return state.scope===scope?state:{items:{},loading:!!scope,partial:false};
}
