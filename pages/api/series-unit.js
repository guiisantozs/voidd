import {steamActor} from '../../lib/steam-server.js';
import {collectionReader} from '../../lib/game-collection-server.js';
import {releaseAdmin} from '../../lib/movie-release-server.js';
import {writeSeriesUnit,writeAnimeEpisodeBatch} from '../../lib/series-unit-server.js';
import {consumptionFailure} from '../../lib/catalog-consumption.js';
export const config={api:{bodyParser:{sizeLimit:'8kb'}}};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({erro:'Método não permitido.'});}
 try{
  const token=typeof req.headers.authorization==='string'&&/^Bearer [^\s]+$/.test(req.headers.authorization)?req.headers.authorization.slice(7):null;if(!token)throw Error('UNAUTHORIZED');
  const reader=collectionReader(token),owner=await steamActor(req,reader);return res.json(await (req.body?.operation==='watch-many'?writeAnimeEpisodeBatch:writeSeriesUnit)({reader,admin:releaseAdmin(),owner,body:req.body}));
 }catch(error){const status=consumptionFailure(error,res)||(error.message==='UNAUTHORIZED'?401:error.message==='INVALID'?400:error.message==='UNRELEASED'?409:error.code==='42501'?403:error.code==='P0001'?429:502);return res.status(status).json({erro:status===401?'Entre novamente para continuar.':status===409?'A avaliação fica disponível após a estreia confirmada.':status===400?'Confira a nota, o comentário e a data.':status===429?'Aguarde antes de tentar novamente.':'Não foi possível salvar. Seus dados anteriores foram preservados.'});}
}
