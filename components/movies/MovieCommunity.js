import {createRefreshQueue} from '../../lib/refresh-queue';
import { DATA_EVENT } from '../../lib/account-storage';
import { withIdentities } from '../../lib/usernames';
import Icon from '../Icon';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '../AccountProvider';
import { feedMovies } from '../../lib/movie-community';
import { useMovieList } from './MovieUI';
import PosterRow from './PosterRow';
import FriendMovieCard, { FriendPosterSkeletons } from './FriendMovieCard';
import { loadFriendMovieCards } from '../../lib/friend-movie-cards';

export function useCommunity() {
  const { client, user } = useAccount();
  const scope = user?.id || 'guest', [sectionScope, setSectionScope] = useState(scope);
  const [sections, setSections] = useState({});
  const generation = useRef(0), requests=useRef({}), queues=useRef(new Map()), activeKeys=useRef(new Set()), controllers=useRef(new Map());
  const read = useCallback(async key => {
    const current = generation.current, request=(requests.current[key]||0)+1;requests.current[key]=request;
    const controller = new AbortController(); controllers.current.set(key, controller);
    setSections(old => ({ ...old, [key]: old[key] && !old[key].error ? old[key] : { loading: true } }));
    try {
      if (!client) throw new Error('Comunidade indisponível. Configure o Supabase para continuar.');
      let state;
      if (['friends', 'recommended'].includes(key) && !user) state = { movies: [], invite: true };
      else if (key === 'friends') {
        const { data, error } = await client.rpc('void_friend_movies').abortSignal(controller.signal);
        if (error) throw error;
        const movies = feedMovies(await withIdentities(client,data.movies.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20)));
        state = { movies: await loadFriendMovieCards(client, movies, controller.signal), invite: !data.friendCount };
      } else if (key === 'recommended') {
        const { data: session, error } = await client.auth.getSession();
        if (error || !session.session) throw new Error('Entre novamente para continuar.');
        controller.signal.throwIfAborted();
        const response = await fetch('/api/movie-recommendations', { headers: { Authorization: `Bearer ${session.session.access_token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]) });
        state = await response.json();
        if (!response.ok) throw new Error(state.erro);
      } else {
        const { data, error } = await client.rpc('void_movie_feed', { section: key }).abortSignal(controller.signal);
        if (error) throw error;
        state = { movies: feedMovies(data) };
      }
      if (current === generation.current && requests.current[key]===request) setSections(old => ({ ...old, [key]: state }));
    } catch { if (current === generation.current && requests.current[key]===request) setSections(old => ({ ...old, [key]: { error: 'Esta seleção não está disponível agora.' } })); }
  }, [client, user?.id]);
  const load = useCallback((key, options) => {
    activeKeys.current.add(key);
    if (!queues.current.has(key)) queues.current.set(key, createRefreshQueue(() => read(key)));
    return queues.current.get(key).refresh(options);
  }, [read]);
  useEffect(() => {
    generation.current++; setSectionScope(scope); setSections({});
    [...activeKeys.current].forEach(key => load(key));
    const timer = setInterval(() => { if (document.visibilityState === 'visible') [...activeKeys.current].forEach(key => load(key)); }, 60000);
    const refresh = () => { if (document.visibilityState !== 'hidden') [...activeKeys.current].forEach(key => load(key, {changed:true})); };
    window.addEventListener(DATA_EVENT, refresh); window.addEventListener('focus', refresh);
    return () => {
      generation.current++; queues.current.forEach(queue => queue.dispose()); queues.current.clear();
      controllers.current.forEach(controller => controller.abort()); controllers.current.clear();
      clearInterval(timer); window.removeEventListener(DATA_EVENT, refresh); window.removeEventListener('focus', refresh);
    };
  }, [load]);
  return { sections: sectionScope === scope ? sections : {}, load };
}
function Invite({ children, href, label }) {
  return <div className="m-empty"><p>{children}</p><Link className="m-see-all" href={href}>{label}{" "}<Icon name="arrow-right" /></Link></div>;
}
export function CommunityRows({ sections, load }) {
  const { user } = useAccount();
  const { saved, ready } = useMovieList();
  return <>
    <PosterRow onVisible={() => load('friends')} sectionKey="friends" title="O que seus amigos avaliaram" icon="user" state={sections.friends} retry={() => load('friends')} className="friend-movie-section" renderCard={movie => <FriendMovieCard key={movie.id} movie={movie} />} skeleton={<FriendPosterSkeletons />}
      empty={sections.friends?.invite ? <Invite href={user ? '/amigos' : '/conta'} label={user ? 'Adicionar amigos' : 'Entrar no VOID'}>Conecte-se com amigos para acompanhar suas avaliações.</Invite> : <p className="m-empty">Seus amigos ainda não publicaram avaliações de filmes.</p>} />
    <PosterRow onVisible={() => load('recommended')} sectionKey="recommended" title="Recomendados para você" icon="film" state={sections.recommended} intro={<RecommendationProgress state={sections.recommended}/>} retry={() => load('recommended')}
      empty={<Invite href={user ? '/' : '/conta'} label={user ? 'Explorar e avaliar filmes' : 'Entrar no VOID'}>{!user ? 'Entre para descobrir filmes com base nas suas notas.' : sections.recommended?.insufficient ? 'Continue avaliando filmes para personalizar esta seleção.' : 'Você já avaliou os filmes encontrados. Novas recomendações aparecerão conforme o catálogo crescer.'}</Invite>} />
    {[['trending', 'Em alta no Void', "arrow-up-right"], ['gems', 'Joias escondidas', "diamond"], ['divided', 'Opiniões divididas', "contrast"]].map(([key, title, icon]) => <PosterRow key={key} onVisible={() => load(key)} sectionKey={`void-${key}`} title={title} icon={icon} state={sections[key]} retry={() => load(key)} empty={<p className="m-empty">Ainda não há avaliações públicas suficientes para esta seleção.</p>} />)}
    <PosterRow sectionKey="continue" title="Continue de onde parou" icon="clock" state={{ loading: !ready, movies: Object.values(saved).map(({ friend, friends, voidNote, friendAverage, friendUpdated, ...movie }) => movie) }} empty={<Invite href="/filmes#movie-trending" label="Explorar filmes">Adicione filmes com “Ver depois” para encontrá-los aqui.</Invite>} />
  </>;
}

function RecommendationProgress({state}){
 if(!state?.progress||state.error||state.loading)return null;
 const count=state.progress.qualifying,remaining=Math.max(0,3-count);
 return <div className="m-recommendation-progress">{state.insufficient&&<><p>Você tem {count} {count===1?'avaliação':'avaliações'} com nota 4 ou mais. {remaining===1?'Falta 1.':`Faltam ${remaining}.`}</p><progress value={Math.min(3,count)} max="3" aria-label={`${count} de 3 avaliações com nota 4 ou mais`}/></>}{state.fallback&&<p>{state.noGenres?'Não encontramos gêneros nessas obras. ':''}Enquanto isso, veja filmes em alta no TMDB.</p>}</div>;
}
