import Icon from '../Icon';
import PosterRow from '../movies/PosterRow';
import {MovieCard} from '../movies/MovieUI';
import {isReviewed} from '../../lib/franchise-model';
import {formatRating} from '../../lib/catalog';
import {marvelSeriesShelves} from '../../lib/marvel-universe';

const shelves=[
  {key:'recent',title:'As mais recentes',icon:'sparkle',intro:'As séries mais recentes primeiro, seguidas dos próximos lançamentos.'},
  {key:'multiverse',title:'Saga do Multiverso',icon:'globe',intro:'As séries da seleção que integram as Fases 4 a 6 do MCU, em ordem de lançamento.'},
  {key:'all',title:'Todas as séries',icon:'monitor',intro:'Toda a seleção de séries da Marvel, incluindo as produções anteriores, em ordem de lançamento.'},
];

export default function MarvelSeriesShelves({items,today,reviews,user,error}) {
  const rows=marvelSeriesShelves(items,{today});
  return <>
    <nav className="mu-shelf-links" aria-label="Seleções de séries da Marvel">{shelves.map(shelf=><a key={shelf.key} href={`#marvel-series-${shelf.key}`}>{shelf.title}<Icon name="arrow-right" className="mu-down"/></a>)}</nav>
    {shelves.map(shelf=><div className="mu-shelf" id={`marvel-series-${shelf.key}`} key={shelf.key}>
      <PosterRow title={shelf.title} icon={shelf.icon} media="series" sectionKey={`marvel-${shelf.key}`} state={{loading:false,movies:rows[shelf.key]}} intro={<p className="mu-shelf-intro">{shelf.intro}</p>}
        renderCard={item=><div className="mu-movie" key={`series:${item.id}`}><MovieCard movie={item} upcoming={!item.estreia||!today||item.estreia>today} now={today?new Date(`${today}T12:00:00-03:00`):undefined}/>{user&&!error&&isReviewed(reviews,item.id,'series')&&<span className="mu-seen"><Icon name="check"/>Avaliada · {formatRating(reviews[`series:${item.id}`].nota)} / 5</span>}</div>}
        empty={<p className="m-empty">Nenhuma série disponível nesta seleção com o filtro atual.</p>}/>
    </div>)}
  </>;
}
