import Icon from '../Icon';
import { useEffect, useRef } from 'react';

export default function DetailModal({id,title,children,onClose,className='',backdropClassName='',initialFocusRef,inertBackground=false,trapFocus=false,ariaDescribedBy,headerContent}) {
  const box=useRef(null);const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement;const overflow=document.body.style.overflow;
    const root=inertBackground?document.getElementById('__next'):null;const wasInert=root?.inert;
    if(root)root.inert=true;
    document.body.style.overflow='hidden';(initialFocusRef?.current||box.current?.querySelector('button'))?.focus();
    const focus=event=>{if((inertBackground||trapFocus)&&box.current&&!box.current.contains(event.target))(initialFocusRef?.current||box.current.querySelector('button'))?.focus();};
    const key=event=>{
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const controls=[...box.current.querySelectorAll('button,a[href],input,select,textarea,iframe,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    if(inertBackground||trapFocus)document.addEventListener('focusin',focus);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);document.body.style.overflow=overflow;if(root)root.inert=wasInert;previous?.focus();};
  },[]);
  return <div className={`md-modal-backdrop ${backdropClassName}`} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section id={id} className={`md-modal ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-describedby={ariaDescribedBy} ref={box}><div className="md-modal-heading">{headerContent||<h2>{title}</h2>}<button type="button" onClick={onClose} aria-label="Fechar janela"><Icon name="close" /></button></div>{children}</section></div>;
}
