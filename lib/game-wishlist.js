export function wantedGames(entries={}) {
  return Object.values(entries).filter(entry=>entry?.status==='want'&&entry.item?.categoria==='jogos')
    .sort((a,b)=>(b.atualizadoEm||'').localeCompare(a.atualizadoEm||'')).map(entry=>entry.item);
}
export function gameWishlist(entries={}) {
  const games=wantedGames(entries);
  return {id:'quero-jogar',title:'Quero jogar',description:'As próximas aventuras da sua jornada. Salve agora e jogue no seu tempo.',special:true,visibility:'private',media_types:['jogos'],item_count:games.length,cover:games.slice(0,5)};
}
