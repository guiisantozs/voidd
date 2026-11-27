import {useRef,useState} from 'react';
import Icon from '../Icon';
import {gameListIdeas,gameIdeaThemes,gameIdeaIcons} from '../../game-list-ideas.config';

export default function GameIdeaPicker({onChoose,busy=false}){
  const [theme,setTheme]=useState('Todos'),track=useRef(null);
  function move(direction){const element=track.current;if(element)element.scrollBy({left:direction*element.clientWidth*.85,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  return <section className="vgl-ideas">
    <div className="vgl-section-heading"><div><p className="vl-overline"><Icon name="sparkle"/> ESCOLHA SUA PRÓXIMA MISSÃO</p><h2>Ideias para começar</h2><p className="vl-muted">São só títulos e descrições; você escolhe as obras.</p></div><div className="vgl-carousel-controls"><button type="button" aria-label="Ideias anteriores" onClick={()=>move(-1)}><Icon name="chevron-left"/></button><button type="button" aria-label="Próximas ideias" onClick={()=>move(1)}><Icon name="chevron-right"/></button></div></div>
    <div className="vl-filters vgl-idea-filters" role="group" aria-label="Filtrar ideias de jogos por tema">{gameIdeaThemes.map(value=><button type="button" key={value} aria-pressed={theme===value} onClick={()=>{setTheme(value);if(track.current)track.current.scrollLeft=0;}}>{value}</button>)}</div>
    <div className="vgl-idea-track" ref={track} tabIndex={0} role="region" aria-label="Ideias de listas de jogos">{gameListIdeas.filter(idea=>theme==='Todos'||idea.theme===theme).map(idea=><button className="vgl-idea" type="button" key={idea.id} disabled={busy} onClick={()=>onChoose(idea)}><span className="vgl-idea-category"><Icon name={gameIdeaIcons[idea.theme]}/>{idea.theme}</span><strong>{idea.title}</strong><span className="vgl-idea-description">{idea.description}</span><span className="vgl-idea-action">Usar esta ideia <Icon name="arrow-right"/></span></button>)}</div>
  </section>;
}
