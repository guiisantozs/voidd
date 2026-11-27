import sharp from 'sharp';
import {mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=[
  '/universos/jogos/the-legend-of-zelda/hero.jpg',
  '/universos/jogos/the-legend-of-zelda/about.jpg',
  '/universos/jogos/grand-theft-auto/hero.webp',
  '/universos/jogos/grand-theft-auto/about-jason-lucia.jpg',
  '/universos/jogos/god-of-war/hero.jpg',
  '/universos/jogos/god-of-war/about.jpg',
  '/games/heroes/the-last-of-us-part-ii.jpg',
  '/universos/jogos/the-last-of-us-about.jpg',
  '/universos/marvel/doomsday.jpg',
  '/universos/marvel/spider-man.jpg',
  '/universos/star-wars/hero.webp',
  '/universos/star-wars/about.webp',
  '/universos/harry-potter/hero.jpg',
  '/universos/harry-potter/about.jpg',
  '/universos/dc/hero.jpg',
  '/universos/dc/about.jpg',
  '/universos/terra-media/hero.jpg',
  '/universos/terra-media/about.jpg',
  '/universos/jurassic/hero.jpg',
  '/universos/jurassic/about.jpg',
];
const directory=path.join(root,'public/universos/optimized');
await mkdir(directory,{recursive:true});
const manifest={};
for(const [index,source] of sources.entries()){
  const original=path.join(root,'public',source.slice(1));
  const metadata=await sharp(original).metadata();
  const fingerprint=createHash('sha256').update(await readFile(original)).digest('hex').slice(0,12);
  const widths=[...new Set([960,1920,2560,3840].map(width=>Math.min(width,metadata.width)))].sort((a,b)=>a-b);
  const variants=[];
  for(const width of widths){
    if(source.endsWith('.webp')&&width===metadata.width){variants.push({src:source,width,bytes:(await stat(original)).size});continue;}
    const name=`universe-${index}-${fingerprint}-${width}.webp`,destination=path.join(directory,name);
    let cached;try{cached=await stat(destination);}catch{}
    const compressedMaster=['/universos/terra-media/','/universos/jurassic/'].some(prefix=>source.startsWith(prefix));
    if(!cached||compressedMaster)await sharp(original).resize({width,withoutEnlargement:true}).webp({quality:compressedMaster?84:92,effort:5}).toFile(destination);
    variants.push({src:`/universos/optimized/${name}`,width,bytes:(await stat(destination)).size});
  }
  manifest[source]={width:metadata.width,height:metadata.height,variants};
  console.log(`${source}: ${Math.round((await stat(original)).size/1024)} KB → ${Math.round(variants.at(-1).bytes/1024)} KB (maior versão)`);
}
await writeFile(path.join(root,'config/universe-artwork.json'),JSON.stringify(manifest,null,2)+'\n');
