export const SERIES_HIGHLIGHTS=[['roteiro','Roteiro'],['atuacao','Atuação'],['trilha-sonora','Trilha sonora'],['direcao','Direção'],['fotografia','Fotografia'],['final','Final'],['ritmo','Ritmo'],['personagens','Personagens']];
export function validSeriesHighlights(value){return Array.isArray(value)&&value.length<=8&&new Set(value).size===value.length&&value.every(key=>SERIES_HIGHLIGHTS.some(row=>row[0]===key));}
export function missingHighlightsColumn(error){return ['42703','PGRST204'].includes(error?.code)&&/highlights/i.test(error.message||'');}
