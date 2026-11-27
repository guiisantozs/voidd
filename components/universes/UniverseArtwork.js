import Image from 'next/image';
import Head from 'next/head';
import artwork from '../../config/universe-artwork.json';

const FallbackImage=Image.default||Image;
// Prebuilt responsive copies avoid both full-size master downloads and the
// image optimizer's first-request work. Source masters are never replaced.
export default function UniverseArtwork({src,sizes='100vw',priority=false,style,alt='',onLoad,onError,...props}){
  const asset=artwork[src];
  if(!asset)return <FallbackImage src={src} sizes={sizes} priority={priority} style={style} alt={alt} onLoad={onLoad} onError={onError} {...props}/>;
  // A cover fills the hero's height on phones. Size its real cropped image,
  // not just the viewport width, to keep characters sharp on dense screens.
  const ratio=asset.width/asset.height;
  const responsiveSizes=priority&&sizes==='100vw'?`(max-aspect-ratio:${asset.width}/${asset.height}) calc(${(ratio*100).toFixed(2)}svh + ${(ratio*96).toFixed(2)}px), 100vw`:sizes;
  const srcSet=asset.variants.map(variant=>`${variant.src} ${variant.width}w`).join(', ');
  const fallback=asset.variants.at(-1).src;
  return <>{priority&&<Head><link key={`universe-art-${src}`} rel="preload" as="image" href={fallback} imageSrcSet={srcSet} imageSizes={responsiveSizes}/></Head>}<img src={fallback} srcSet={srcSet} sizes={responsiveSizes} alt={alt} width={asset.width} height={asset.height} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':undefined} decoding="async" onLoad={onLoad} onError={onError} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',...style}}/></>;
}
