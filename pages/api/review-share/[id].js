import {shareOptions,shareImagePath} from '../../../lib/review-share';
import {loadShareReview,shareFailure} from '../../../lib/review-share-server';
import {renderReviewCard} from '../../../lib/review-card-image';
export const config={api:{responseLimit:'4mb'},maxDuration:30};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 try{
  const options=shareOptions(req.query),authorization=req.headers.authorization;
  if(authorization&&!/^Bearer [^\s]+$/.test(authorization))throw Error('UNAUTHORIZED');
  const model=await loadShareReview(req.query.id,{token:authorization?.slice(7)});res.setHeader('X-Review-Visibility',model.isPublic?'public':'private');
  if(options.info)return res.json({...model,link:model.isPublic?model.origin+'/avaliacao/'+model.id:null,image:shareImagePath(model.id,options)});
  // Authorization is always rechecked before the rendering cache or ETag.
  const {buffer,key}=await renderReviewCard(model,options);
  res.setHeader('Content-Type','image/png');res.setHeader('Content-Disposition','inline; filename="void-review-'+model.externalId+'.png"');
  if(model.isPublic){res.setHeader('Cache-Control','private, max-age=0, no-cache, must-revalidate');res.setHeader('ETag','"'+key+'"');if(req.headers['if-none-match']==='"'+key+'"')return res.status(304).end();}
  res.setHeader('Content-Length',buffer.length);return res.status(200).end(buffer);
 }catch(error){const failure=shareFailure(error);if(failure.status===429)res.setHeader('Retry-After','60');return res.status(failure.status).json({erro:failure.message});}
}
