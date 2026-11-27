// Existing IDs remain RAWG. New IGDB-only works have an explicit numeric
// namespace compatible with existing records, lists and profile bigint fields.
// NEVER send a namespaced ID to RAWG or store it as a rawg_id in Steam imports.
export const IGDB_ID_BASE = 9000000000;
export const igdbGameId = id => Number.isSafeInteger(Number(id)) && Number(id)>0 && Number(id)<1000000000 ? IGDB_ID_BASE+Number(id) : null;
export const decodeIGDBGameId = id => /^[1-9]\d{0,9}$/.test(String(id)) && Number(id)>IGDB_ID_BASE ? Number(id)-IGDB_ID_BASE : null;
export const useIGDBCatalog = () => process.env.GAME_CATALOG_PROVIDER !== 'rawg';
