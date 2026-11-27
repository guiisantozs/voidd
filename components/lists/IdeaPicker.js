import { useEffect,useRef,useState } from 'react';
import { seasonalIdeas,listIdeas } from '../../list-ideas.config';
import GameIdeaPicker from './GameIdeaPicker';

const themeNames=['Todos',...new Set(listIdeas.map(idea=>idea.theme))];
const themeClasses={'Datas':'dates','Gêneros':'genres','Franquias':'franchises','Momentos':'moments','Décadas':'decades','Primeiros passos':'starting'};
export default function IdeaPicker(props){return props.media==='jogos'?<GameIdeaPicker {...props}/>:<StandardIdeaPicker {...props}/>;}
function StandardIdeaPicker({onChoose,busy=false,compact=false,media=null}) {
  const [theme,setTheme]=useState('Todos'),[ideas,setIdeas]=useState(listIdeas);
  const track=useRef(null);
  useEffect(()=>setIdeas(seasonalIdeas()),[]);
  useEffect(()=>{if(track.current)track.current.scrollLeft=0;},[theme,ideas]);
  const filtered=ideas.filter(idea=>(!media||idea.media_types?.includes(media))&&(theme==='Todos'||idea.theme===theme));
  return <section className={`vl-ideas ${compact?'vl-ideas--compact':''}`}>
    <div className="vl-section-heading"><div><h2>Ideias para começar</h2><p className="vl-muted">São só títulos e descrições; você escolhe as obras.</p></div></div>
    <div className="vl-filters" role="group" aria-label="Filtrar ideias por tema">{themeNames.map(value=><button key={value} type="button" aria-pressed={theme===value} onClick={()=>setTheme(value)}>{value}</button>)}</div>
    <div className="vl-ideas-grid" ref={track}>{filtered.map(idea=><button type="button" key={idea.id} className={`vl-idea vl-idea--${themeClasses[idea.theme]||'genres'}`} disabled={busy} onClick={()=>onChoose(idea)}><span className="vl-idea-labels"><span className="vl-idea-theme">{idea.theme}</span>{idea.inSeason&&<span className="vl-season-tag">Em época</span>}</span><strong>{idea.title}</strong><span className="vl-idea-description">{idea.description}</span><span className="vl-idea-action">Usar esta ideia</span></button>)}</div>
  </section>;
}
