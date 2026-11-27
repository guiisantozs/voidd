import {seriesPrivateContext} from './series-personalization-server.js';
import {seriesTasteIds} from './series-tastes.js';
import {decodeAnimeId} from './anime-provider.js';
import {animeMetadata,getAnimeSection} from './anime-catalog.js';
import {animeGenreNames} from '../config/animes.js';
export function createAnimePreferencesHandler({context=seriesPrivateContext,metadata=animeMetadata}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({erro:'Método não permitido.'});}
 try{
  const {reader,owner}=await context(req);
  if(req.method==='GET'){const {data,error}=await reader.from('void_anime_preferences').select('anime_ids,updated_at').eq('user_id',owner).maybeSingle();if(error)throw error;return res.json({preferences:data?{ids:data.anime_ids,updatedAt:data.updated_at}:null});}
  const ids=seriesTasteIds(req.body?.ids);if(ids.some(id=>!decodeAnimeId(id)))throw Error('INVALID_PREFERENCES');
  const loaded=await metadata(ids),today=new Date().toISOString().slice(0,10);
  if(loaded.partial)throw Error('SOURCE');if(loaded.items.length!==3||loaded.items.some(item=>!item.poster||!item.estreia||item.estreia>today))throw Error('INVALID_PREFERENCES');
  const {data,error}=await reader.from('void_anime_preferences').upsert({user_id:owner,anime_ids:ids},{onConflict:'user_id'}).select('anime_ids,updated_at').single();if(error)throw error;
  return res.json({preferences:{ids:data.anime_ids,updatedAt:data.updated_at},items:loaded.items});
 }catch(error){const status=error.message==='UNAUTHORIZED'?401:error.message==='INVALID_PREFERENCES'?400:502;return res.status(status).json({erro:status===400?'Escolha três animes diferentes que já estrearam.':status===401?'Entre novamente para continuar.':'Não foi possível carregar ou salvar suas preferências. Tente novamente.'});}
};}
export function createAnimeTasteHandler({context=seriesPrivateContext,metadata=animeMetadata,section=getAnimeSection}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 try{
  const {reader,owner}=await context(req),{data,error}=await reader.from('void_anime_preferences').select('anime_ids').eq('user_id',owner).maybeSingle();if(error)throw error;if(!data)return res.json({movies:[],needsPreferences:true});
  const loaded=await metadata(data.anime_ids);if(loaded.partial||loaded.items.length!==3)throw Error('SOURCE');
  const genres=new Map();for(const item of loaded.items)for(const id of item.genreIds||[])genres.set(id,(genres.get(id)||0)+1);
  const top=[...genres].filter(([id])=>animeGenreNames[id]).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id])=>id).join('|');if(!top)return res.json({movies:[]});
  const result=await section('recommended',1,{genres:top}),excluded=new Set(data.anime_ids.map(String));
  return res.json({...result,movies:result.movies.filter(item=>!excluded.has(String(item.id))&&item.estreia&&item.estreia<=new Date().toISOString().slice(0,10)).map(item=>({...item,recommendationReason:'Gêneros em comum com seus animes favoritos'}))});
 }catch(error){return res.status(error.message==='UNAUTHORIZED'?401:502).json({erro:'Não foi possível carregar suas recomendações. Tente novamente.'});}
};}
