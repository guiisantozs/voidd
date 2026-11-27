import {createAnimeTasteHandler} from '../../../lib/anime-personalization-server.js';
import {getAnimeSection} from '../../../lib/anime-catalog.js';
import {enrichAnimeArtwork} from '../../../lib/anime-artwork.js';
export const config={maxDuration:60};
export default createAnimeTasteHandler({section:async(...args)=>enrichAnimeArtwork(await getAnimeSection(...args))});
