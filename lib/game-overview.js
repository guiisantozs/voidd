// Overview configuration: public catalogue limits, never social/privacy defaults.
export const OVERVIEW_SCREENSHOTS = 12;
export const OVERVIEW_TAGS = 8;
export const OVERVIEW_RELATED = 8;
export const OVERVIEW_SIMILAR = 6;
export const OVERVIEW_REVEAL_MS = 420;
export const OVERVIEW_REVEAL_STEP_MS = 60;
export const OVERVIEW_COUNTDOWN_MS = 60000;

const text = value => String(value || '').replace(/<br\s*\/?>|<\/(?:li|p|div)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\r/g,'').trim();
export function pcRequirementLines(value) {
  return text(value).split(/\n+/).map(line=>line.replace(/^[-•]\s*/, '').trim()).filter(line=>line && !/^(?:minimum|recommended|m[ií]nimos?|recomendados?):?$/i.test(line)).slice(0,20);
}
export function gameOverviewFacts(data) {
  const pc = (data.platforms || []).find(entry=>entry.platform?.slug==='pc'||entry.platform?.name==='PC');
  const minimum=pcRequirementLines(pc?.requirements?.minimum),recommended=pcRequirementLines(pc?.requirements?.recommended);
  const people=rows=>(rows||[]).filter(row=>Number.isInteger(row.id)&&row.id>0&&row.name).map(({id,name})=>({id,name}));
  return { esrb: data.esrb_rating?.name || '', playtime: Number.isFinite(data.playtime)&&data.playtime>0?data.playtime:null,
    platformCount: data.platforms?.length || data.parent_platforms?.length || 0,
    tags: people((data.tags||[]).filter(tag=>!tag.language||tag.language==='eng')).map(tag=>({...tag})),
    developers:people(data.developers),publishers:people(data.publishers),
    requirements:pc&&(minimum.length||recommended.length)?{minimum,recommended}:null };
}
export function safeGameStores(rows=[]) {
  const stores=[]; const seen=new Set();
  for(const row of rows)try{
    const url=new URL(row.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;
    const host=url.hostname.toLowerCase();
    const matched=[['store.steampowered.com','Steam','PC'],['store.epicgames.com','Epic Games',''],['epicgames.com','Epic Games',''],['store.playstation.com','PlayStation Store','PlayStation'],['xbox.com','Xbox','Xbox'],['microsoft.com','Xbox','Xbox'],['nintendo.com','Nintendo eShop','Nintendo'],['gog.com','GOG','']].find(([domain])=>host===domain||host.endsWith('.'+domain));
    if(!matched||seen.has(matched[1]))continue;
    url.protocol='https:';seen.add(matched[1]);stores.push({name:matched[1],platform:matched[2],url:url.href});
  }catch{}
  return stores;
}
export function releaseCountdown(released,now=new Date()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(released||''))return null;
  const calendar=new Date(released+'T00:00:00Z');
  if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==released)return null;
  const target=Date.parse(released+'T00:00:00-03:00'),remaining=target-now.getTime();
  if(!Number.isFinite(remaining)||remaining<=0)return null;
  return {days:Math.floor(remaining/86400000),hours:Math.floor(remaining/3600000)%24,minutes:Math.floor(remaining/60000)%60};
}
export function overviewDistribution(histogram=[]) {
  const bins=Array.from({length:6},(_,i)=>({rating:5-i,total:0}));
  for(const row of histogram){const rating=Number(row.rating),total=Number(row.total);if(Number.isFinite(rating)&&rating>=0&&rating<=5&&Number.isFinite(total)&&total>=0)bins[5-Math.round(rating)].total+=total;}
  return bins;
}
