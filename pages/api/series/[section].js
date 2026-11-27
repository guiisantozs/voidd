import {getSeriesSection,seriesMetadata} from '../../../lib/series-catalog.js';
import {consumptionFailure} from '../../../lib/catalog-consumption.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 const {section,page='1',genres='',ids}=req.query;
 if(typeof section!=='string'||typeof page!=='string'||!/^[1-9]\d{0,2}$/.test(page)||typeof genres!=='string')return res.status(400).json({erro:'Seleção inválida.'});
 try{const data=section==='metadata'&&typeof ids==='string'?await seriesMetadata(ids.split(',')):await getSeriesSection(section,Number(page),{genres});const maxAge=['editorial','hero','trending','weekly'].includes(section)?21600:section==='new-episodes'?600:3600;res.setHeader('Cache-Control',data.partial?'no-store':`public, max-age=0, s-maxage=${maxAge}`);return res.json(data);}
 catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||(error.message==='INVALID'?400:error.message==='CONFIG'?503:502)).json({erro:error.message==='INVALID'?'Seleção inválida.':'Esta seleção de séries está indisponível no momento.'});}
}
