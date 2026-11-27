import Link from 'next/link';
import { useState } from 'react';
import Icon from '../Icon';
import { ProfileAvatar } from '../profile/ProfileUI';
import DetailModal from './DetailModal';
import { MovieImage, SaveMovie, rememberMovie } from './MovieUI';
import MovieReviewAction from './MovieReviewAction';
import { movieHref } from '../../lib/movie-sections';
import { tmdbDisplayRating } from '../../lib/ratings';

const rating = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';

export function FriendPosterSkeletons() {
  return <div className="m-poster-track friend-movie-skeletons" role="status" aria-label="Carregando avaliações dos amigos">{Array.from({ length: 6 }, (_, i) => <div className="friend-movie-card" key={i} aria-hidden="true"><div className="friend-movie-poster m-skeleton" /><div className="friend-movie-caption"><span className="friend-skeleton-title m-skeleton" /><span className="friend-skeleton-meta m-skeleton" /><span className="friend-skeleton-line m-skeleton" /></div><div className="friend-skeleton-actions m-skeleton" /></div>)}</div>;
}

export default function FriendMovieCard({ movie }) {
  const [open, setOpen] = useState(false);
  const friends = movie.friends, single = friends.length === 1, first = friends[0];
  // Navigation may cache catalogue facts, never the friends' authorized reviews
  // in sessionStorage shared by subsequent accounts in the same browser tab.
  const { friends: authorizedFriends, friend, friendAverage, friendUpdated, ...catalogue } = movie;
  const remember = () => rememberMovie(catalogue);
  const label = single ? `${first.display_name || 'Pessoa do Void'} avaliou com ${rating(movie.friendAverage)} de 5` : `${friends.length} amigos avaliaram ${movie.titulo}, média ${rating(movie.friendAverage)} de 5`;
  return <article className="friend-movie-card">
    <div className="friend-movie-poster-wrap">
      <Link className="friend-movie-poster" href={movieHref(movie)} onClick={remember} aria-label={`Ver detalhes de ${movie.titulo}`}><MovieImage movie={movie} /></Link>
      <div className="m-card-overlay"><div className="m-card-actions"><SaveMovie movie={catalogue} /><MovieReviewAction movie={catalogue} onClick={remember} /></div></div>
    </div>
    <div className="friend-movie-caption"><Link className="friend-movie-title" href={movieHref(movie)} title={movie.titulo} onClick={remember}>{movie.titulo}</Link>
      <p className="friend-movie-meta">{movie.ano || '—'}{Number.isFinite(tmdbDisplayRating(movie))&&<> <span aria-hidden="true">·</span> <span>TMDB {rating(tmdbDisplayRating(movie))}/5</span></>}</p>
      <button className="friend-movie-line" type="button" onClick={() => setOpen(true)} title={label} aria-label={`${label}. Ver avaliações`} aria-haspopup="dialog" aria-expanded={open}>
        <span className="friend-movie-avatars" aria-hidden="true">{friends.slice(0, 3).map(friend => <ProfileAvatar key={friend.user_id} profile={friend} lazySigning />)}{friends.length > 3 && <span className="friend-movie-extra">+{friends.length - 3}</span>}</span>
        {single && <span className="friend-movie-handle">{first.username ? `@${first.username}` : 'Amigo'}</span>}
        <span className="friend-movie-rating"><Icon name="star" />{rating(movie.friendAverage)}{!single && <small>amigos</small>}</span>
      </button>
    </div>
    {open && <DetailModal title={`Avaliações dos amigos · ${movie.titulo}`} className="friend-movie-dialog" onClose={() => setOpen(false)}><ul className="friend-movie-reviews">{friends.map(friend => <li key={friend.user_id}><header><ProfileAvatar profile={friend} /><div><strong>{friend.display_name || 'Pessoa do Void'}</strong>{friend.username && <span>@{friend.username}</span>}</div><span className="friend-movie-rating" aria-label={`Nota ${rating(Number(friend.rating))} de 5`}><Icon name="star" />{rating(Number(friend.rating))}</span></header><p>{friend.spoiler ? 'Review com spoiler. Abra a avaliação para ler.' : friend.text ? `${friend.text.slice(0, 160)}${friend.text.length > 160 ? '…' : ''}` : 'Avaliou sem deixar comentário.'}</p><Link href={`${movieHref(movie)}?tab=reviews&review=${encodeURIComponent(friend.user_id)}`} onClick={() => setOpen(false)}>Ver avaliação <Icon name="arrow-up-right" /></Link></li>)}</ul></DetailModal>}
  </article>;
}
