import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Icon from '../../components/Icon';
import { UniverseShell, useUniverseResource, useUniverseReviews } from '../../components/universes/UniverseUI';
import { UniverseFeatured, UniversePortalCard, UniversePortalSkeleton } from '../../components/universes/UniversePortal';
import { MovieFailure } from '../../components/movies/MovieUI';
import { filterPortalRows, readUniverseQuery, universeFilters, universePortalRows, universeQuery, universeSorts, universeSummary } from '../../lib/movie-universe-portal';

export default function Universos() {
  const router = useRouter();
  const state = useUniverseResource('/api/universos');
  const { reviews, user, error } = useUniverseReviews();
  const [activeColor, setActiveColor] = useState(null);
  const values = readUniverseQuery(router.query);
  const [search, setSearch] = useState(values.search);
  useEffect(() => { setSearch(values.search); }, [values.search]);
  function update(patch) {
    router.push({pathname:router.pathname, query:universeQuery(router.query, {...values, ...patch})}, undefined, {shallow:true, scroll:false});
  }
  const rows = universePortalRows(state.data?.franchises || [], reviews);
  const summary = universeSummary(rows, reviews);
  const visible = filterPortalRows(rows, values);
  const ready = Boolean(state.data) && !state.error;
  const metric = value => !ready || error ? '—' : value;

  return <UniverseShell title="Universos" className="universe-portal"><div className="up-ambient" aria-hidden="true" style={{'--up-hover':activeColor || '#9670d8'}}/>
    <main className="m-container up-main">
      <header className="up-header">
        <div><p className="up-kicker">CADA HISTÓRIA TEM UM UNIVERSO</p><h1>Explore além<br/><span>de um filme.</span></h1><p className="up-lead">Reencontre suas histórias. Descubra a próxima maratona.</p></div>
        <dl className="up-summary" aria-label="Seu progresso nos universos">
          <div><dt>Universos iniciados</dt><dd>{metric(summary.started)}</dd></div>
          <div><dt>Filmes vistos</dt><dd>{metric(summary.seen)}</dd></div>
          <div><dt>Último universo</dt><dd className="up-summary-universe">{!ready || error ? '—' : summary.latest ? <><strong>{summary.latest.seen}<small> filmes vistos</small></strong><span>{summary.latest.nome}</span></> : <><strong>—</strong><span>Sua jornada começa aqui</span></>}</dd></div>
        </dl>
        <p className="up-note">{user ? 'O progresso considera filmes avaliados, inclusive em privado.' : <><Link href="/conta">Entre na sua conta</Link> para acompanhar seu progresso. Avaliações privadas também contam.</>}</p>
      </header>
      {error && <p className="up-notice" role="status">{error}</p>}
      {!state.data && state.loading ? <UniversePortalSkeleton/> : state.error ? <MovieFailure message={state.error} retry={state.retry}/> : <>
        {summary.featured && <UniverseFeatured key={summary.featured.slug} row={summary.featured} reviews={reviews} unavailable={Boolean(error)} onActivate={setActiveColor}/>}
        <section className="up-explore" aria-labelledby="up-explore-title">
          <div className="up-section-heading"><div><p className="up-kicker">ESCOLHA ONDE ENTRAR</p><h2 id="up-explore-title">Um portal. Muitos mundos.</h2></div><span role="status">{visible.length} {visible.length === 1 ? 'universo' : 'universos'}</span></div>
          <div className="up-tools">
            <div className="up-filters" role="group" aria-label="Filtrar universos por progresso">{universeFilters.map(([key, label]) => <button key={key} type="button" aria-pressed={values.filter === key} onClick={() => update({filter:key})}>{label}</button>)}</div>
            <form className="up-search" role="search" onSubmit={event => {event.preventDefault(); update({search});}}><Icon name="search"/><label className="sr-only" htmlFor="up-search">Buscar universo por nome</label><input id="up-search" type="search" placeholder="Buscar universo" value={search} maxLength={100} onChange={event => {setSearch(event.target.value); if (!event.target.value) update({search:''});}}/><button type="submit" aria-label="Buscar universo"><Icon name="arrow-right"/></button></form>
            <div className="up-sort"><label htmlFor="up-sort">Ordenar</label><select id="up-sort" value={values.sort} onChange={event => update({sort:event.target.value})}>{universeSorts.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          </div>
          {visible.length ? <div className="up-grid">{visible.map((row, index) => <UniversePortalCard key={row.slug} row={row} index={index} wide={index === 0 && visible.length > 1} unavailable={Boolean(error)} retry={state.retry} loading={state.loading} onActivate={setActiveColor}/>)}</div> : <div className="up-empty"><h3>{rows.length ? 'Nenhum universo por aqui. Ainda.' : 'Os universos estão a caminho.'}</h3><p>{rows.length ? 'Tente outro nome ou mude os filtros para encontrar sua próxima história.' : 'Não há universos disponíveis neste momento.'}</p>{rows.length > 0 && <button type="button" onClick={() => update({filter:'all', search:''})}>Limpar filtros</button>}</div>}
        </section>
      </>}
    </main>
  </UniverseShell>;
}
