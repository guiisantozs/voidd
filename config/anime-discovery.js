export const animeDiscoveryNote='Atividade recente e reconhecimento nas comunidades de anime, com sinais e disponibilidade no Brasil. N\u00e3o \u00e9 um ranking de audi\u00eancia brasileira.';
export function localizedAnimeQuery(query){
 const key=String(query).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 return ({diariosdeumaapotecaria:'Kusuriya no Hitorigoto',friereneajornadaparaoalem:'Sousou no Frieren',ataquedostitas:'Shingeki no Kyojin',narutoshippuden:'Naruto Shippuuden'})[key]||query;
}
