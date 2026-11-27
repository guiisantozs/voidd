import LazyCatalogSection from '../components/movies/LazyCatalogSection';
import MovieHeader from '../components/movies/MovieHeader';
import CatalogFooter from '../components/movies/CatalogFooter';
import CatalogNowPlaying from '../components/movies/CatalogNowPlaying';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { CommunityRows, useCommunity } from '../components/movies/MovieCommunity';
import MovieHero from '../components/movies/MovieHero';
import MovieSearch from '../components/movies/MovieSearch';
import PosterRow from '../components/movies/PosterRow';
import WeeklyFeature from '../components/movies/WeeklyFeature';
import UniverseShortcuts from '../components/universes/UniverseShortcuts';
import { MovieListProvider } from '../components/movies/MovieUI';
import { useMovieCatalog } from '../lib/use-movie-catalog';
import { movieThemes } from '../lib/movie-sections';

export default function Filmes() {
  const { sections, load } = useMovieCatalog();
  const community = useCommunity();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  return <MovieListProvider><div className="movies-page movies-home"><Head><title>Filmes — VOID</title><meta name="description" content="Filmes em cartaz no Brasil, próximos lançamentos e seleções para explorar. Descubra e avalie no VOID." /></Head>
    <MovieHeader utilityNavigation/>
    <main><MovieHero state={sections.hero} retry={() => load('hero')} /><MovieSearch /><LazyCatalogSection section="now-playing" state={sections["now-playing"]} load={load}><CatalogNowPlaying state={sections['now-playing']} load={load} /></LazyCatalogSection><LazyCatalogSection section="weekly" state={sections["weekly"]} load={load}><WeeklyFeature state={sections.weekly} retry={() => load('weekly')} /></LazyCatalogSection>
    <UniverseShortcuts />
    <div className="m-container m-rows"><LazyCatalogSection section="upcoming" state={sections["upcoming"]} load={load}><PosterRow sectionKey="upcoming" title="Próximos lançamentos" icon="clock" upcoming now={now} state={sections.upcoming} retry={() => load('upcoming')} /></LazyCatalogSection><PosterRow sectionKey="trending" title="Em alta agora" icon="arrow-up-right" state={sections.weekly} retry={() => load('weekly')} /><CommunityRows sections={community.sections} load={community.load} />{movieThemes.map(theme => <LazyCatalogSection key={theme.key} section={theme.key} state={sections[theme.key]} load={load}><PosterRow sectionKey={theme.key} title={theme.title} icon={theme.icon} state={sections[theme.key]} retry={() => load(theme.key)} /></LazyCatalogSection>)}</div>
    </main><CatalogFooter/></div></MovieListProvider>;
}
