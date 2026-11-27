import { safeProfileImage } from './profile.js';
const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
// Keep framing in the existing banner URL; the fragment is never sent to TMDB.
export function profileBanner(value) {
  const source = safeProfileImage(value);
  if (!source) return {source:'',x:50,y:40};
  const url = new URL(source);
  const position = url.hash.match(/^#void-banner=(\d{1,3}),(\d{1,3})$/);
  if (position) url.hash = '';
  return {source:url.href,x:position?clamp(position[1]):50,y:position?clamp(position[2]):40};
}
export function positionBanner(value,x,y) {
  const {source} = profileBanner(value);
  if (!source) return '';
  const url = new URL(source);
  url.hash = `void-banner=${clamp(x)},${clamp(y)}`;
  return url.href;
}
