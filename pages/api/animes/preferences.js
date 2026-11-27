import {createAnimePreferencesHandler} from '../../../lib/anime-personalization-server.js';
export const config={api:{bodyParser:{sizeLimit:'2kb'}},maxDuration:60};
export default createAnimePreferencesHandler();
