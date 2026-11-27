// Local SVG artwork: no icon fonts or platform-dependent emoji rendering.
const paths = {
  calendar: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  edit: 'm16 3 5 5-13 13H3v-5L16 3Zm-2 2 5 5M3 21h18',
  'more': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  'arrow-left': 'M19 12H5m7-7-7 7 7 7',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'arrow-up': 'M12 19V5m-7 7 7-7 7 7',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-right': 'm9 6 6 6-6 6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  diamond: 'm12 3 9 9-9 9-9-9Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  moon: 'M20.5 13A8.5 8.5 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
  user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 8 0 0 1 16 0v2',
  mail: 'M3 5h18v14H3Zm0 0 9 8 9-8',
  users: 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2 21v-2a7 7 0 0 1 14 0v2m1-17a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 5v1',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  trophy: 'M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 2v5m-4 2h8M9 19h6',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 14 6-6 5 5 3-3 4 4M16 7h.01',
  film: 'M4 3h16v18H4Zm4 0v18M16 3v18M4 8h4M4 16h4M16 8h4M16 16h4',
  play: 'm8 4 12 8-12 8Z',
  pause: 'M8 5v14M16 5v14',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  lock: 'M6 10h12v11H6Zm3 0V6a3 3 0 0 1 6 0v4m-3 4v3',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 5-5 13 0 18m0-18c5 5 5 13 0 18M3 12h18',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M5.2 7a8 8 0 0 1 13-2L20 7M4 17l1.8 2a8 8 0 0 0 13-2',
  contrast: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0v18m0-18a9 9 0 0 1 0 18Z',
  monitor: 'M3 4h18v13H3Zm9 13v4m-4 0h8',
  gamepad: 'M7 7h10a4 4 0 0 1 4 3l1 7a3 3 0 0 1-5 2l-3-3h-4l-3 3a3 3 0 0 1-5-2l1-7a4 4 0 0 1 4-3Zm-2 5h6m-3-3v6m8-4h.01M19 14h.01',
};

export default function Icon({ name, className = '', ...props }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`void-icon ${className}`} {...props}>{name === 'dot' ? <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" /> : <path d={paths[name] || paths.sparkle} />}</svg>;
}

export function RatingStars({ value }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  return <span className="void-rating-stars" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span className="void-rating-star" key={i}><Icon name="star" /><span style={{ width: `${Math.max(0, Math.min(1, rating - i)) * 100}%` }}><Icon name="star" /></span></span>)}</span>;
}
