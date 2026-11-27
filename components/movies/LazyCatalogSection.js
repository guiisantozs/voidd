import {useEffect} from 'react';
import {useVisibleSection} from '../../lib/use-visible-section';

// Preserve the section and its existing skeleton while deferring its data.
export default function LazyCatalogSection({section,state,load,children}){
  const [ref,visible]=useVisibleSection();
  useEffect(()=>{if(visible&&!state)load(section);},[visible,!!state,load,section]);
  return <div ref={ref}>{children}</div>;
}
