// Public catalogue policy shared by browser and server. No account data here.
export const SEARCH_CACHE_MS=5*60*1000;
export const SELECTION_CACHE_MS=10*60*1000;
export const SEARCH_DELAY_MS=450;
export const normalizeSearchTerm=value=>String(value||'').trim().replace(/\s+/g,' ');
export const shortSearch=term=>normalizeSearchTerm(term).length===1;
export const SEARCH_CACHE_HEADER='public, s-maxage=300';
