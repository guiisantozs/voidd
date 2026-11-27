import {createClient} from '@supabase/supabase-js';
import {parseShareId,shareModel,sharePosterUrl} from './review-share.js';
import { avatarImageUrl } from './avatars.js';
import { resolveGameCover } from './game-cover-server.js';
import { gameCoverPresentation } from './game-cover-client.js';
export function shareOrigin(){const host=process.env.VERCEL_PROJECT_PRODUCTION_URL;return host&&/^[a-z0-9.-]+$/i.test(host)?'https://'+host:'https://void-lake-ten.vercel.app';}
export async function readShareReview(client,id,actor=null,{publicOnly=false,budget=true,resolveCover=resolveGameCover}={}){
 const target=parseShareId(id);if(!target)throw Error('INVALID');
 if(budget){const {error}=await client.rpc('void_review_share_budget');if(error)throw Error(error.message?.includes('RATE_LIMIT')?'RATE_LIMIT':'UNAVAILABLE');}
 const [review,identity]=await Promise.all([
  client.from('void_records').select('payload,updated_at').eq('user_id',target.owner).eq('kind','review').eq('item_key',target.itemKey).maybeSingle(),
  client.from('void_community_profiles').select('display_name,username,visibility,avatar_id').eq('user_id',target.owner).maybeSingle()
 ]);
 if(review.error||identity.error)throw Error('UNAVAILABLE');
 if(!review.data?.payload||!identity.data)throw Error('NOT_FOUND');
 const model=shareModel(review.data,identity.data,id);
 if(String(review.data.payload.item.id)!==(target.movie||target.game)||model.media!==(target.game?'jogos':'filmes')||(!model.isPublic&&(publicOnly||actor!==target.owner)))throw Error('NOT_FOUND');
 if(target.game){
  try{const resolved=await resolveCover(target.game);const image=gameCoverPresentation(review.data.payload.item,{data:resolved.body,loading:false});model.poster=sharePosterUrl(image.url,'jogos');model.coverSource=image.source||null;}catch{model.poster=null;model.coverSource=null;}
 }
 let authorAvatar=null;
 if(identity.data.avatar_id){
  // Resolve after review/profile authorization and again before every cache hit.
  const {data,error}=await client.rpc('void_avatar_identities',{ids:[target.owner]});
  if(error)throw Error('UNAVAILABLE');
  const avatar=data?.find(row=>row.user_id===target.owner)?.avatar;
  if(avatarImageUrl(avatar,96))authorAvatar=avatar;
 }
 return {...model,authorAvatar,origin:shareOrigin()};
}
export async function loadShareReview(id,{token=null,publicOnly=false}={}){
 if(!parseShareId(id))throw Error('INVALID');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw Error('UNAVAILABLE');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{...(token?{headers:{Authorization:'Bearer '+token}}:{}),fetch:(input,options={})=>fetch(input,{...options,signal:AbortSignal.timeout(10000)})}});
 let actor=null;if(token){const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw Error('UNAUTHORIZED');actor=data.user.id;}
 return readShareReview(client,id,actor,{publicOnly});
}
export function shareFailure(error){return error.message==='INVALID'?{status:400,message:'Opções ou avaliação inválidas.'}:error.message==='NOT_FOUND'?{status:404,message:'Esta avaliação não está disponível para compartilhar.'}:error.message==='UNAUTHORIZED'?{status:401,message:'Entre novamente para acessar sua avaliação.'}:error.message==='RATE_LIMIT'?{status:429,message:'Muitos cards em pouco tempo. Aguarde um minuto e tente novamente.'}:{status:503,message:'Não foi possível preparar o card. Sua avaliação continua salva.'};}
