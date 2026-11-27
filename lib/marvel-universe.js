import {marvelUniverse,marvelSeriesMultiverse,marvelCombinedChronology} from '../config/marvel-universe.js';
import {isReviewed,orderFranchiseMovies} from './franchise-model.js';

export function marvelShelves(movies=[],{today='',filter='all',reviews={}}={}) {
  const unique=[...new Map(movies.map(movie=>[movie.id,movie])).values()];
  const visible=unique.filter(movie=>filter==='all'||(filter==='seen'?isReviewed(reviews,movie.id):!isReviewed(reviews,movie.id)));
  const release=orderFranchiseMovies(visible);
  const released=release.filter(movie=>movie.estreia&&today&&movie.estreia<=today);
  const future=release.filter(movie=>!movie.estreia||!today||movie.estreia>today);
  return {
    recent:[...released].reverse().concat(future),
    chronological:orderFranchiseMovies(released,marvelUniverse.chronology,'chronological'),
    infinity:release.filter(movie=>marvelUniverse.infinity.includes(movie.id)),
    multiverse:release.filter(movie=>marvelUniverse.multiverse.includes(movie.id)),
  };
}

export function marvelSeriesShelves(series=[],{today=''}={}) {
  const unique=[...new Map(series.filter(item=>item.categoria==='series').map(item=>[item.id,item])).values()];
  const all=orderFranchiseMovies(unique);
  const released=all.filter(item=>item.estreia&&today&&item.estreia<=today);
  const upcoming=all.filter(item=>!item.estreia||!today||item.estreia>today);
  return {
    recent:[...released].reverse().concat(upcoming),
    multiverse:all.filter(item=>marvelSeriesMultiverse.includes(item.id)),
    all,
  };
}

export function marvelCombinedShelves(films=[],series=[],{today='',filter='all',reviews={}}={}) {
  const key=item=>`${item.categoria}:${item.id}`;
  const items=[...films.map(item=>({...item,categoria:'filmes'})),...series.filter(item=>item.categoria==='series')];
  const unique=[...new Map(items.map(item=>[key(item),item])).values()];
  const visible=unique.filter(item=>filter==='all'||(filter==='seen'?isReviewed(reviews,item.id,item.categoria):!isReviewed(reviews,item.id,item.categoria)));
  const all=orderFranchiseMovies(visible);
  const released=all.filter(item=>item.estreia&&today&&item.estreia<=today);
  const upcoming=all.filter(item=>!item.estreia||!today||item.estreia>today);
  const positions=new Map(marvelCombinedChronology.map((value,index)=>[value,index]));
  const chronological=[...released].sort((a,b)=>{
    const aPosition=positions.get(key(a)),bPosition=positions.get(key(b));
    if(aPosition==null&&bPosition==null)return 0;
    if(aPosition==null)return 1;
    if(bPosition==null)return -1;
    return aPosition-bPosition;
  }).map((item,index)=>({...item,universeOrder:index+1,chronologyKnown:positions.has(key(item))}));
  return {
    chronological,
    recent:[...released].reverse().concat(upcoming),
    all,
    multiverse:all.filter(item=>(item.categoria==='series'?marvelSeriesMultiverse:marvelUniverse.multiverse).includes(item.id)),
  };
}

export function doomsdayCountdown(now,deadline=Date.parse(marvelUniverse.release)) {
  if(!Number.isFinite(now)||!Number.isFinite(deadline))return null;
  const remaining=Math.max(0,Math.ceil((deadline-now)/1000));
  return {days:Math.floor(remaining/86400),hours:Math.floor(remaining%86400/3600),minutes:Math.floor(remaining%3600/60),seconds:remaining%60,finished:remaining===0};
}

export function doomsdayProgress(now,start=Date.parse(marvelUniverse.countdownStart),deadline=Date.parse(marvelUniverse.release)) {
  if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(deadline)||deadline<=start)return null;
  return Math.min(100,Math.max(0,(now-start)/(deadline-start)*100));
}
