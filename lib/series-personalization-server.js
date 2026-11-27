import {steamActor} from './steam-server.js';
import {collectionReader} from './game-collection-server.js';
import {seriesMetadata} from './series-catalog.js';
import {seriesTasteIds} from './series-tastes.js';
import {tasteRecommendations} from './series-taste-catalog.js';

export async function seriesPrivateContext(req){
 const header=req.headers.authorization;
 if(typeof header!=='string'||!/^Bearer [^\s]+$/.test(header))throw Error('UNAUTHORIZED');
 const reader=collectionReader(header.slice(7));return {reader,owner:await steamActor(req,reader)};
}
function privateHeaders(res){res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');}
const shape=row=>row?{ids:row.series_ids,updatedAt:row.updated_at}:null;
async function read(reader,owner){const {data,error}=await reader.from('void_series_preferences').select('series_ids,updated_at').eq('user_id',owner).maybeSingle();if(error)throw error;return data;}
function fail(res,error){const status=error.message==='UNAUTHORIZED'?401:error.message==='INVALID_PREFERENCES'?400:error.code==='42501'?403:502;return res.status(status).json({erro:status===401?'Entre novamente para personalizar suas séries.':status===400?'Escolha três séries diferentes que já estrearam, com pôster disponível.':'Não foi possível carregar ou salvar suas preferências. Tente novamente.'});}
export function createSeriesPreferencesHandler({context=seriesPrivateContext,metadata=seriesMetadata,today=()=>new Date().toISOString().slice(0,10)}={}){return async(req,res)=>{
 privateHeaders(res);
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({erro:'Método não permitido.'});}
 try{
  const {reader,owner}=await context(req);
  if(req.method==='GET')return res.json({preferences:shape(await read(reader,owner))});
  const ids=seriesTasteIds(req.body?.ids),loaded=await metadata(ids);
  if(loaded.partial)throw Error('METADATA_UNAVAILABLE');
  if(loaded.items.length!==3||loaded.items.some(s=>!s.estreia||s.estreia>today()))throw Error('INVALID_PREFERENCES');
  const {data,error}=await reader.from('void_series_preferences').upsert({user_id:owner,series_ids:ids},{onConflict:'user_id'}).select('series_ids,updated_at').single();if(error)throw error;
  return res.json({preferences:shape(data),items:loaded.items});
 }catch(error){return fail(res,error);}
};}
export function createSeriesTasteHandler({context=seriesPrivateContext,recommend=tasteRecommendations}={}){return async(req,res)=>{
 privateHeaders(res);
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 try{const {reader,owner}=await context(req),row=await read(reader,owner);if(!row)return res.json({movies:[],needsPreferences:true});return res.json(await recommend(row.series_ids));}catch(error){return fail(res,error);}
};}
