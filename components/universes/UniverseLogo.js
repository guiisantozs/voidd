import { useId } from 'react';

// Render the original artwork through a luminance mask. This removes JPEG
// backgrounds without redrawing the lettering or shipping a canvas dependency.
export default function UniverseLogo({ logo, priority = false }) {
  const filterId = `universe-logo-${useId().replace(/:/g, '')}`;
  // An alpha threshold removes the extraction halo at render time, keeping the
  // source bitmap intact. Existing movie luminance masks remain unchanged.
  if (logo.transparent && logo.alphaCutoff) return <svg className="u-shortcut-logo" viewBox={`0 0 ${logo.width} ${logo.height}`} width="160" height="96" aria-hidden="true" focusable="false"><defs><filter id={filterId} colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope={1 / (1 - logo.alphaCutoff)} intercept={-logo.alphaCutoff / (1 - logo.alphaCutoff)} /></feComponentTransfer></filter></defs><image href={logo.src} width={logo.width} height={logo.height} filter={`url(#${filterId})`} /></svg>;
  if (logo.transparent) return <img className="u-shortcut-logo" src={logo.src} alt="" width="160" height="96" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" />;
  const luminance = logo.invert ? '-.2126 -.7152 -.0722 0 1' : '.2126 .7152 .0722 0 0';
  const [low, high] = logo.levels || [.12, .7];
  const slope = 1 / (high - low);
  const [x,y,width,height]=logo.crop.split(' ');

  return <svg className="u-shortcut-logo" viewBox={logo.crop} width="160" height="64" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${filterId}-crop`}><rect x={x} y={y} width={width} height={height}/></clipPath>
      <filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${luminance}`} />
        <feComponentTransfer><feFuncA type="linear" slope={slope} intercept={-low * slope} /></feComponentTransfer>
      </filter>
    </defs>
    <g clipPath={`url(#${filterId}-crop)`}><image href={logo.src} width={logo.width} height={logo.height} filter={`url(#${filterId})`} /></g>
  </svg>;
}
