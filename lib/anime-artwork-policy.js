export const ANIME_ARTWORK_VERSION=6;
export const promotionalBackdrop=(width,height)=>Number(width)>=1920&&Number(height)>=1080&&Number(width)/Number(height)>=1.5&&Number(width)/Number(height)<=2.1;
export function animeHeroEligible(item){return ['tmdb','fanart'].includes(item?.backdropProvider)&&promotionalBackdrop(item.backdropWidth,item.backdropHeight)&&!!item.backdrop;}
export function bestAnimeImage(rows,kind){
 const valid=(rows||[]).filter(row=>kind==='backdrop'?promotionalBackdrop(row.width,row.height):row.width>=600&&row.height>=900&&row.width/row.height>=.55&&row.width/row.height<=.8);
 const language=row=>kind==='poster'?({pt:3,en:2,ja:1})[row.iso_639_1]||0:!row.iso_639_1?1:0;
 return valid.sort((a,b)=>language(b)-language(a)||(b.vote_count>=3?b.vote_average:0)-(a.vote_count>=3?a.vote_average:0)||(b.vote_count||0)-(a.vote_count||0)||b.width-a.width)[0]||null;
}
