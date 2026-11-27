// One landing page per shared universe; only the catalogue's initial media changes.
export const sharedUniverses=[
  {slug:'marvel-mcu',seriesSlug:'marvel'},
  {slug:'terra-media',seriesSlug:'senhor-dos-aneis'},
];
export const sharedUniverseBySlug=slug=>sharedUniverses.find(row=>row.slug===slug);
export function universeMedia(value){return ['filmes','series','all'].includes(value)?value:'filmes';}
export function seriesUniverseHref(slug) {
  const shared=sharedUniverses.find(row=>row.seriesSlug===slug);
  return shared?`/universos/${shared.slug}?media=series&from=series`:`/series/universos/${encodeURIComponent(slug)}`;
}
export function universeMediaQuery(query,media) {
  const next={...query,media:universeMedia(media)};
  if(next.media==='filmes')delete next.media;
  return next;
}
