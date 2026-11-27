import Icon from '../Icon';
import Link from 'next/link';
import { useUniverseResource } from './UniverseUI';
import PosterRow from '../movies/PosterRow';
import { MovieFailure,MovieListProvider,PosterSkeletons } from '../movies/MovieUI';
export default function MovieUniverses({id}){
  const state=useUniverseResource(`/api/movie-universes?id=${encodeURIComponent(id)}`);
  if(state.data&&!state.data.universes.length&&!state.data.partial)return null;
  return <section className="movies-page u-membership"><MovieListProvider>{state.loading?<><h2>Universos deste filme</h2><PosterSkeletons count={3} /></>:state.error?<MovieFailure message="Não foi possível consultar os universos deste filme." retry={state.retry} />:<>{state.data?.universes.map(row=><div key={row.slug} style={{'--universe-accent':row.cor}}><Link className="u-member-link" href={`/universos/${row.slug}`}>Faz parte do universo {row.nome}{" "}<Icon name="arrow-right" /></Link><p className="u-hint">Filmes vizinhos na ordem de lançamento.</p><PosterRow title="Continue neste universo" sectionKey={`universe-${row.slug}`} state={{movies:row.movies}} /></div>)}{state.data?.partial&&<MovieFailure message="Alguns universos estão indisponíveis. As demais informações do filme continuam disponíveis." retry={state.retry} />}</>}</MovieListProvider></section>;
}
