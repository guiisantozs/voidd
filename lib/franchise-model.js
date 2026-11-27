export function isReviewed(reviews,id,media='filmes'){const rating=reviews?.[`${media}:${id}`]?.nota;return Number.isFinite(rating)&&rating>=0&&rating<=5;}
export function franchiseProgress(ids,reviews,media='filmes'){return ids.filter(id=>isReviewed(reviews,id,media)).length;}
export function orderFranchiseMovies(movies,chronology=[],mode='release'){
  const positions=new Map(chronology.map((id,index)=>[id,index]));
  return [...movies].sort((a,b)=>{
    if(mode==='chronological'){
      const difference=(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity);
      if(difference)return difference;
    }
    return (a.estreia||'9999-99-99').localeCompare(b.estreia||'9999-99-99')||a.id-b.id;
  });
}
export function filterUniverseMovies(ordered,reviews,filter='all',sort='order',media='filmes'){
  const rows=ordered.map((movie,index)=>({...movie,universeOrder:index+1})).filter(movie=>filter==='all'||(filter==='seen'?isReviewed(reviews,movie.id,media):!isReviewed(reviews,movie.id,media)));
  if(sort==='rating')rows.sort((a,b)=>(b.nota??-1)-(a.nota??-1)||a.universeOrder-b.universeOrder);
  if(sort==='year')rows.sort((a,b)=>(a.ano||'9999').localeCompare(b.ano||'9999')||a.universeOrder-b.universeOrder);
  return rows;
}
export function weightedVoidRating(rows){const total=rows.reduce((sum,row)=>sum+Number(row.total),0);return total?rows.reduce((sum,row)=>sum+Number(row.average)*Number(row.total),0)/total:null;}
