import {createSeriesPreferencesHandler} from '../../../lib/series-personalization-server.js';
export const config={api:{bodyParser:{sizeLimit:'2kb'}},maxDuration:60};
export default createSeriesPreferencesHandler();
