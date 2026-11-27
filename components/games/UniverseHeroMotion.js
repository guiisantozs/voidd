import { useEffect,useRef } from 'react';
export default function UniverseHeroMotion({children}){
  const root=useRef(null);
  useEffect(()=>{
    const element=root.current,motion=window.matchMedia('(prefers-reduced-motion: reduce)');let frame;
    const update=()=>{
      cancelAnimationFrame(frame);
      if(motion.matches){element.style.removeProperty('--gu-parallax');return;}
      frame=requestAnimationFrame(()=>{if(window.scrollY<element.offsetHeight+160)element.style.setProperty('--gu-parallax',`${Math.min(48,Math.max(0,window.scrollY*.1))}px`);});
    };
    update();window.addEventListener('scroll',update,{passive:true});motion.addEventListener('change',update);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);motion.removeEventListener('change',update);};
  },[]);
  return <div ref={root} className="gu-hero-motion">{children}</div>;
}
