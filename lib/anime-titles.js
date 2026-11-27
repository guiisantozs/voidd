// Display aliases only. Persisted title, provider identity and links stay intact.
const title=value=>typeof value==='string'?value.trim():'';
export function animeDisplayTitle(item){
 const international=[title(item.englishTitle),title(item.internationalTitle)].filter(Boolean).sort((a,b)=>a.length-b.length);
 return title(item.localizedTitle)||international[0]||title(item.displayTitle)||title(item.titulo)||'Anime';
}
export const withAnimeDisplayTitle=item=>({...item,displayTitle:animeDisplayTitle(item)});
