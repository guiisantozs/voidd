import Link from 'next/link';
import { useRouter } from 'next/router';
import Icon from '../../../../components/Icon';
import GameCover from '../../../../components/GameCover';
import GameUniverseShell from '../../../../components/games/GameUniverseShell';
import GameMedia from '../../../../components/games/GameMedia';
import { MovieFailure } from '../../../../components/movies/MovieUI';
import { gameUniverseDetailProps } from '../../../../lib/game-universes';

// IGDB editions without a verified RAWG identity keep their own catalogue page.
// Never mount review/status controls with a null or substituted work ID.
export default function UniverseGame({universe,item,error}) {
  const router=useRouter(),back=`/jogos/universos/${universe.slug}`;
  return <GameUniverseShell className="game-full-page gp-page gu-catalog-detail" title={item?.titulo||universe.nome} description={item?.sinopse||universe.descricao}>
    <main className="game-full-main">
      {error?<section className="m-container gu-detail-error"><h1>Não foi possível carregar o jogo</h1><MovieFailure message="O catálogo está temporariamente indisponível." retry={()=>router.reload()}/><Link className="game-full-back" href={back}><Icon name="arrow-left"/>Voltar para {universe.nome}</Link></section>:<>
        <section className="game-hero-full" aria-labelledby="game-full-title">
          <div className={`game-full-background${!item.backdrop?' gu-detail-cover-background':''}`} aria-hidden="true"><img className="game-full-image" src={item.backdrop||item.officialCover.url} alt="" decoding="async" fetchPriority="high"/></div><div className="game-full-shade" aria-hidden="true"/>
          <div className="game-full-layout"><div className="game-full-copy">
            <Link className="game-full-back" href={back}><Icon name="arrow-left"/>{universe.nome}</Link>
            <p className="game-full-eyebrow">VOID PLAY <span>{item.ano||'A anunciar'}</span></p>
            <h1 id="game-full-title">{item.titulo}</h1>
            {!!item.plataformas?.length&&<ul className="game-full-platforms" aria-label="Plataformas">{item.plataformas.map(name=><li key={name}>{name}</li>)}</ul>}
            {!!item.generos?.length&&<ul className="game-full-genres" aria-label="Gêneros">{item.generos.map(name=><li key={name}>{name}</li>)}</ul>}
            {item.sinopse&&<p className="game-full-description">{item.sinopse}</p>}
            <div className="game-full-actions"><a className="game-button" href="#informacoes">Sobre o jogo <Icon name="arrow-right"/></a><Link className="gp-hero-action" href={back+'#gu-games-title'}>Explorar o universo</Link></div>
          </div><aside className="gu-detail-cover" aria-label={`Capa de ${item.titulo}`}><GameCover item={item} portraitOnly eager sizes="(max-width:760px) 160px, 240px"/></aside></div>
        </section>
        <div className="gp-content gu-detail-content" id="informacoes"><section className="gp-section" aria-labelledby="gu-detail-about"><h2 id="gu-detail-about">Sobre o jogo</h2><p className="gu-detail-description">{item.sinopse||'Ainda não há descrição disponível para esta edição.'}</p></section>
          <section className="gp-section" aria-labelledby="gu-detail-facts"><h2 id="gu-detail-facts">Informações</h2><dl className="gp-facts"><div><dt>Lançamento</dt><dd>{item.estreia?item.estreia.split('-').reverse().join('/'):item.ano||'A anunciar'}</dd></div>{item.plataformas?.length>0&&<div><dt>Plataformas</dt><dd>{item.plataformas.join(' · ')}</dd></div>}{(item.informacoes||[]).map(info=><div key={info.label}><dt>{info.label}</dt><dd>{info.valor}</dd></div>)}</dl></section>
          {!!item.screenshots?.length&&<GameMedia item={item}/>}
          <p className="gp-subtle">Metadados e capas: IGDB.</p>
        </div>
      </>}
    </main>
  </GameUniverseShell>;
}

export async function getServerSideProps({params,res}) {
  const result=await gameUniverseDetailProps(params);
  if(result.props?.error)res.statusCode=503;
  return result;
}
