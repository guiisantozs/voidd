import Link from 'next/link';
import { useState } from 'react';
import Icon from '../Icon';
import Poster from '../Poster';
import { ProfileAvatar } from '../profile/ProfileUI';
import { useAccount } from '../AccountProvider';
import ListCover from '../lists/ListCover';
import UniverseLogo from '../universes/UniverseLogo';
import { ShareReviewButton } from '../review-share/ReviewShare';
import { shareImagePath, reviewShareId } from '../../lib/review-share';
import { formatRating } from '../../lib/catalog';
import { parseRating } from '../../lib/ratings';
import { franchises } from '../../franchises.config';
import HomeMotion from './HomeMotion';

function SharedReview({ review }) {
  const [failed, setFailed] = useState(false), id = reviewShareId(review.user_id, review.item_key), score = parseRating(review.rating);
  return <article className="void-home-shared-review"><Link className="void-home-review-image" href={`/filme/${review.movie.id}?tab=reviews&review=${encodeURIComponent(review.user_id)}`} aria-label={`Ler avaliação de ${review.movie.titulo}`}>
    {id && !failed ? <img src={shareImagePath(id, { format: 'square', excerpt: false })} alt={`Card de ${review.movie.titulo}, nota ${formatRating(score)} de 5`} width="1080" height="1080" loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <Poster item={review.movie}/>}</Link>
    <div className="void-home-review-caption"><div><ProfileAvatar profile={review} lazySigning/><span><strong>{review.display_name || 'Pessoa do Void'}</strong><small>{review.username ? `@${review.username}` : 'Comunidade Void'}</small></span><b><Icon name="star"/>{formatRating(score)}<small>/5</small></b></div>
      <h3>{review.movie.titulo}</h3><p>{review.spoiler ? 'Uma opinião com spoilers. Abra a avaliação para ler.' : review.text ? `${review.text.slice(0, 130)}${review.text.length > 130 ? '…' : ''}` : 'Uma história, uma nota, uma nova conversa.'}</p><ShareReviewButton id={id}/>
    </div>
  </article>;
}

export default function HomeWorlds({ social, reviews, library, watchlist }) {
  const { user } = useAccount(), list = social.lists?.rows?.[0], people = social.connections?.amigos || [];
  const own = Object.values(reviews).filter(review => review?.item?.titulo), ownItems = own.map(review => review.item).slice(0, 4);
  const listItems = list?.cover || Object.values(watchlist).slice(0, 5);
  const games = Object.values(library), weekly = social.community?.rows || [];
  return <div className="void-home-worlds">
    <HomeMotion><section className="void-home-universe-stage" aria-labelledby="home-worlds-title"><div className="void-home-stage-copy"><p className="void-home-overline">CADA HISTÓRIA ABRE UMA PORTA</p><h2 id="home-worlds-title">Um favorito.<br/>Todo um <em>universo.</em></h2><p>Reencontre personagens, siga novas histórias e descubra como tudo se conecta.</p><Link className="void-home-link" href="/universos">Explorar os universos <Icon name="arrow-right"/></Link></div><nav className="void-home-universe-grid" aria-label="Universos em destaque">{franchises.slice(0, 4).map(franchise => <Link key={franchise.slug} href={`/universos/${franchise.slug}`} style={{ '--world-accent': franchise.cor }} aria-label={`Explorar ${franchise.nome}`}><span className="void-home-world-orbit" aria-hidden="true"/><UniverseLogo logo={franchise.logo}/><span>{franchise.nome}<Icon name="arrow-up-right"/></span></Link>)}</nav></section></HomeMotion>
    <HomeMotion><section className="void-home-personal" aria-labelledby="home-personal-title"><div className="void-home-section-intro"><p className="void-home-overline">DO SEU JEITO</p><h2 id="home-personal-title">Um lugar para<br/>o que fica <em>com você.</em></h2><p>Organize o que ama. Encontre quem entende.</p></div>
      <div className="void-home-bento">
        <Link className="void-home-feature void-home-feature-lists" href={user ? '/listas' : '/conta'}><span className="void-home-feature-symbol"><Icon name="list"/></span><div className="void-home-feature-art" aria-hidden="true">{user && listItems.length ? <ListCover items={listItems} title={list?.title || 'Ver depois'}/> : <div className="void-home-list-art"><i/><i/><i/><Icon name="list"/></div>}</div><div><small>SUAS ESCOLHAS, JUNTAS</small><h3>Listas para cada fase.</h3><p>{user && list ? `Sua lista: ${list.title}` : user && listItems.length ? `${listItems.length} títulos na prévia de Ver depois.` : social.lists?.error ? 'Sua prévia volta já. Suas listas estão no mesmo lugar.' : 'Da próxima maratona aos jogos que você ainda vai zerar.'}</p><span>Explorar listas <Icon name="arrow-up-right"/></span></div></Link>
        <Link className="void-home-feature void-home-feature-friends" href={user ? '/amigos' : '/conta'}><span className="void-home-feature-symbol"><Icon name="users"/></span><div className="void-home-feature-art void-home-circle-art" aria-hidden="true">{people.length ? people.slice(0, 5).map(person => <ProfileAvatar key={person.user_id} profile={person} lazySigning/>) : <><span><Icon name="film"/></span><span><Icon name="gamepad"/></span><span><Icon name="users"/></span></>}</div><div><small>SEU CÍRCULO, SUAS CONVERSAS</small><h3>Gostar é bom.<br/>Compartilhar é melhor.</h3><p>{user && people.length ? `${people.length} ${people.length === 1 ? 'amigo para trocar descobertas' : 'amigos para trocar descobertas'}.` : 'Encontre pessoas que também vivem outras histórias.'}</p><span>Encontrar meu círculo <Icon name="arrow-up-right"/></span></div></Link>
        <Link className="void-home-feature void-home-feature-shelf" href={user ? '/perfil' : '/conta'}><span className="void-home-feature-symbol"><Icon name="star"/></span><div><small>SUA ESTANTE TEM HISTÓRIA</small><h3>O que você viveu<br/>merece ficar.</h3><p>{user && own.length ? `${own.length} ${own.length === 1 ? 'avaliação na sua jornada' : 'avaliações na sua jornada'}${games.length ? ` e ${games.length} ${games.length === 1 ? 'jogo' : 'jogos'} na biblioteca` : ''}.` : 'Suas notas, seus favoritos e as histórias que marcaram você.'}</p><span>Ver minha estante <Icon name="arrow-up-right"/></span></div><div className="void-home-shelf-art" aria-hidden="true">{user && ownItems.length ? ownItems.map(item => <Poster key={`${item.categoria}:${item.id}`} item={item}/>) : <><i/><i/><i/><i/></>}</div></Link>
        <Link className="void-home-feature void-home-feature-worlds" href="/universos"><span className="void-home-feature-symbol"><Icon name="globe"/></span><div><small>SEMPRE HÁ MAIS PARA EXPLORAR</small><h3>Uma história<br/>nunca vem sozinha.</h3><p>Da Terra-média a uma galáxia muito, muito distante.</p><span>Conhecer universos <Icon name="arrow-up-right"/></span></div><div className="void-home-mini-world" aria-hidden="true"><span>v.</span><i/><i/></div></Link>
      </div>
    </section></HomeMotion>
    <HomeMotion><section className="void-home-community" aria-labelledby="home-community-title"><div className="void-home-community-heading"><div><p className="void-home-overline">VOZES DO VOID</p><h2 id="home-community-title">Histórias que viraram<br/><em>conversa.</em></h2><p>Avaliações públicas dos últimos sete dias.</p></div><Link className="void-home-link" href="/avaliacoes">Ouvir a comunidade <Icon name="arrow-right"/></Link></div>
      {!social.community ? <div className="void-home-community-loading" role="status" aria-label="Carregando avaliações da semana"><i/><i/><i/></div> : social.community.error ? <div className="void-home-catalog-notice" role="status"><p>As conversas voltam já. Não foi possível carregar as avaliações agora.</p><button type="button" onClick={social.retry}>Tentar novamente</button></div> : weekly.length ? <div className="void-home-community-grid">{weekly.map(review => <SharedReview key={review.user_id+review.item_key} review={review}/>)}</div> : <div className="void-home-community-empty"><Icon name="star"/><h3>A próxima conversa pode começar com você.</h3><p>As avaliações públicas da semana aparecerão aqui.</p><Link href="/filmes">Encontre uma história para avaliar <Icon name="arrow-right"/></Link></div>}
    </section></HomeMotion>
    <HomeMotion><aside className="void-home-coming-soon"><span><Icon name="monitor"/></span><div><p className="void-home-overline">O UNIVERSO CONTINUA CRESCENDO</p><h2>Novas histórias estão chegando.</h2><p>Animes agora fazem parte do seu universo.</p></div><Link href="/animes">Explorar animes</Link></aside></HomeMotion>
  </div>;
}

export function HomeFooter() {
  return <footer className="void-home-footer"><div className="void-home-footer-intro"><Link className="logo" href="/">void<span><Icon name="dot"/></span></Link><p>Toda história deixa uma marca.<br/>Guarde a sua aqui.</p></div><nav aria-label="Explorar o Void"><h2>Explore</h2><Link href="/filmes">Filmes</Link><Link href="/jogos">Jogos</Link><Link href="/universos">Universos</Link><Link href="/series">Séries</Link><Link href="/animes">Animes</Link></nav><nav aria-label="Comunidade do Void"><h2>Conecte-se</h2><Link href="/amigos">Amigos</Link><Link href="/avaliacoes">Avaliações</Link><Link href="/listas">Listas</Link></nav><nav aria-label="Seu espaço no Void"><h2>Seu espaço</h2><Link href="/perfil">Meu perfil</Link><Link href="/conta">Minha conta</Link><Link href="/jogos/biblioteca">Biblioteca de jogos</Link></nav><div className="void-home-footer-credits"><p>Dados e imagens: <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a> e <a href="https://rawg.io/" target="_blank" rel="noopener noreferrer">RAWG</a>.</p><small>Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</small><span>Feito para quem vive outros universos.</span></div></footer>;
}
