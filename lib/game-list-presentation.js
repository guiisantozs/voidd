// A paginated response only describes the loaded selection. Mixed lists do not
// expose their game count, so never relabel their total works as games.
export function gameListsSummary(rows=[],wishlist=null){
  const visible=wishlist?[wishlist,...rows]:rows;
  return {lists:visible.length,games:visible.every(list=>list.media_types?.length===1&&list.media_types[0]==='jogos')?visible.reduce((sum,list)=>sum+(Number(list.item_count)||0),0):null,shared:visible.filter(list=>list.collaboration_enabled).length};
}
