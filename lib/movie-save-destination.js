import {listsPage} from './lists.js';

// Ver depois always exists, even before its optional metadata row is created.
export async function movieSaveDestination(client,userId,signal){
 if(!userId)return 'watchlist';
 const page=await listsPage(client,{mode:'mine',signal});
 return page.rows.length||page.has_more?'picker':'watchlist';
}
