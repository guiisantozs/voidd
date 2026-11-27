import Icon from '../Icon';
import { allListMedia,listMedia,listMediaNames } from '../../lib/lists';

export function ListMediaPicker({value=allListMedia,onChange,disabled=false}) {
  const mixed=value.length===allListMedia.length;
  function toggle(type){const next=mixed?[type]:value.includes(type)?value.filter(item=>item!==type):[...value,type];onChange(next.length?next:[...allListMedia]);}
  return <fieldset className="vl-media-picker" disabled={disabled}><legend>Sobre o que é a lista?</legend><p>Escolha uma ou mais categorias. Mista inclui todos os tipos.</p><div role="group" aria-label="Categorias da lista"><button type="button" aria-pressed={mixed} onClick={()=>onChange([...allListMedia])}><Icon name="list"/> Mista</button>{listMedia.map(([type,icon])=><button type="button" key={type} aria-pressed={!mixed&&value.includes(type)} onClick={()=>toggle(type)}><Icon name={icon}/>{listMediaNames[type]}</button>)}</div></fieldset>;
}
export function ListMediaFilter({value,onChange}) {
  return <div className="vl-media-filter"><span>Filtrar listas por</span><div className="vl-filters" role="group" aria-label="Filtrar listas por mídia"><button type="button" aria-pressed={!value} onClick={()=>onChange(null)}>Todas</button>{listMedia.map(([type,icon])=><button type="button" key={type} aria-pressed={value===type} onClick={()=>onChange(type)}><Icon name={icon}/>{listMediaNames[type]}</button>)}</div></div>;
}
export function ListMediaTags({types=allListMedia}) {
  const labels=types.map(type=>listMediaNames[type]).filter(Boolean);
  return <span className="vl-media-tag" title={labels.join(', ')} aria-label={`Categorias: ${labels.join(', ')}`}>{types.length===1?labels[0]:'Mista'}</span>;
}
