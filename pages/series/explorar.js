import Head from 'next/head';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect} from 'react';
import MovieHeader from '../../components/movies/MovieHeader';
import {MovieCard,MovieFailure,MovieListProvider,PosterSkeletons} from '../../components/movies/MovieUI';
import CatalogFooter from '../../components/movies/CatalogFooter';
import {useCatalogSections} from '../../lib/use-movie-catalog';
import {seriesGenres} from '../../config/series';
import {animeGenres} from '../../config/animes';
const seriesNames={trending:'Séries em alta',acclaimed:'Aclamadas pela crítica',essentials:'Todos precisam assistir',gems:'Todos precisam assistir',...Object.fromEntries(seriesGenres.map(genre=>[genre.key,genre.title]))};
export default function ExploreSeries({media='series'}){
 const anime=media==='animes',names=anime?{trending:'Animes em alta',upcoming:'Próximos lançamentos',acclaimed:'Aclamados pelo público',essentials:'Todos precisam assistir',...Object.fromEntries(animeGenres.map(g=>[g.key,g.title]))}:seriesNames;
 const router=useRouter(),section=typeof router.query.section==='string'&&Object.hasOwn(names,router.query.section)?router.query.section:'trending';
 const raw=typeof router.query.page==='string'?Number(router.query.page):1,page=Number.isInteger(raw)&&raw>=1&&raw<=500?raw:1;
 const {sections,load}=useCatalogSections({basePath:`/api/${media}`,initial:[]}),state=sections[section];
 useEffect(()=>{if(router.isReady)load(section,page);},[router.isReady,section,page,load]);
 const loading=!state||state.loading||state.page!==page;
 return <MovieListProvider><div className="movies-page series-explore"><Head><title>{names[section]} — {anime?'Animes':'Séries'} · VOID</title></Head><MovieHeader home current={media} media={media} seriesOnly/><main className="m-container series-explore-content"><Link href={`/${media}`}>Voltar ao catálogo</Link><h1>{names[section]}</h1>{loading?<PosterSkeletons label="Carregando séries"/>:state.error?<MovieFailure message={state.error} retry={()=>load(section,page)}/>:<><div className="u-film-grid">{state.movies.map(movie=><MovieCard key={movie.id} movie={movie}/>)}</div>{!state.movies.length&&<p className="m-empty">Nenhuma série nesta seleção. Explore outro gênero.</p>}<nav className="series-pagination" aria-label="Páginas de séries">{page>1&&<Link href={{pathname:`/${media}/explorar`,query:{section,page:page-1}}}>Anterior</Link>}<span>Página {page}</span>{page<state.totalPages&&<Link href={{pathname:`/${media}/explorar`,query:{section,page:page+1}}}>Próxima</Link>}</nav></>}</main><CatalogFooter media={media}/></div></MovieListProvider>;
}
