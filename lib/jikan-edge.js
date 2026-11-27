import {validReleaseDate} from './movie-release.js';

export const JIKAN_EDGE_URL='https://jikan.lucashdo.com/v1';
const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
// MAL also supplies compact/partial dates and English episode calendar dates.
// Preserve only complete valid dates; year/month alone never become Jan 1.
export function edgeDate(value){
 if(typeof value!=='string')return null;
 const iso=value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);if(iso)return validReleaseDate(iso[1])?iso[1]:null;
 const compact=value.match(/^(\d{4})(\d{2})(\d{2})$/);if(compact){const date=compact.slice(1).join('-');return validReleaseDate(date)?date:null;}
 const english=value.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(\d{4})(?:\s*\(JST\))?$/);
 if(!english)return null;const date=`${english[3]}-${String(months[english[1]]).padStart(2,'0')}-${english[2].padStart(2,'0')}`;return validReleaseDate(date)?date:null;
}
const images=row=>row?.images?.jpg?row.images:{jpg:{image_url:row?.images?.medium||row?.imageUrl||null,large_image_url:row?.images?.large||row?.images?.medium||row?.imageUrl||null}};
const person=row=>({mal_id:row?.malId??row?.mal_id,name:row?.name||'',images:images(row)});
export function edgeAnime(row){
 if(!row||typeof row!=='object')throw Error('SOURCE');
 const date=edgeDate(row.aired?.from||row.startDate),year=row.year??(row.startDate?.match(/^(\d{4})|\b(\d{4})\b/)?.slice(1).find(Boolean));
 return {...row,mal_id:row.malId??row.mal_id,catalogProvider:'jikan-edge',title_english:row.titleEnglish??row.title_english,title_japanese:row.titleJapanese??row.title_japanese,images:images(row),
  aired:{from:date||row.aired?.from&&edgeDate(row.aired.from)||null,to:edgeDate(row.aired?.to||row.endDate)},year:year??null,scored_by:row.scoredBy??row.scored_by??null,
  genres:(row.genres||[]).map(g=>({...g,mal_id:g.malId??g.mal_id})),studios:(row.studios||[]).map(g=>({...g,mal_id:g.malId??g.mal_id})),
  trailer:row.trailer?{...row.trailer,youtube_id:row.trailer.youtubeId??row.trailer.youtube_id}:null,
  relations:(row.relations||[]).map(r=>r.entry?r:{relation:r.relation,entry:[{mal_id:r.malId,type:r.type,name:r.title}]}),
  theme:row.themeSongs||row.theme||{openings:[],endings:[]},streaming:(row.streaming||[]).filter(s=>s.available!==false)};
}
function edgeEpisode(row,path){
 const single=path.match(/^anime\/(\d+)\/episodes\/(\d+)$/);
 if(single&&(Number(row.malId)!==Number(single[1])||Number(row.episode)!==Number(single[2])))throw Error('SOURCE');
 const number=single?Number(row.episode):Number(row.number);if(!Number.isInteger(number)||number<1||number>10000)throw Error('SOURCE');
 let duration=row.duration;
 if(typeof duration==='string'){const match=duration.match(/^(\d{2}):(\d{2}):(\d{2})$/);duration=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):null;}
 return {...row,mal_id:number,aired:edgeDate(row.aired),duration:Number.isFinite(duration)?duration:null};
}
export function edgeRequest(path,params={}){
 const allowed=path==='anime'?['q','page','type','status','rating','score','min_score','genres','order_by','sort','letter','start_date','end_date']:path==='top/anime'?['page','filter']:path==='seasons/now'?['continuing']:/^anime\/\d+\/episodes$/.test(path)?['page']:[];
 // limit/sfw/genres_exclude are not supported by Edge. Adult genres/ratings
 // remain excluded locally; never silently drop a requested user genre/year.
 return Object.fromEntries(Object.entries(params).filter(([key])=>allowed.includes(key)));
}
export function edgeResponse(path,payload){
 if(!payload||!Object.hasOwn(payload,'data'))throw Error('SOURCE');
 const map=row=>/\/episodes(?:\/\d+)?$/.test(path)?edgeEpisode(row,path):path.endsWith('/characters')?{character:person(row),role:row.role,voice_actors:(row.voiceActors||[]).map(v=>({language:v.language,person:person(v)}))}:path.endsWith('/staff')?{person:person(row),positions:row.role?[row.role]:[]}:path.endsWith('/recommendations')?{entry:edgeAnime(row),votes:row.votes}:edgeAnime(row);
 const pagination=payload.meta?.pagination;
 return {data:Array.isArray(payload.data)?payload.data.map(map):map(payload.data),provider:'jikan-edge',stale:!!payload.meta?.stale,
  ...(pagination?{pagination:{current_page:pagination.page,has_next_page:pagination.hasNextPage===true,items:{per_page:pagination.limit,count:pagination.count,total:pagination.total??null}}}:{})};
}
