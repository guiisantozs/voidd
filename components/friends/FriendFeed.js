import { memo } from 'react';
import Link from 'next/link';
import { ProfileAvatar } from '../profile/ProfileUI';
import { CircleEmpty,CircleSkeleton } from './FriendsUI';
import { FriendReview } from './FriendCard';
import { useVisibleSection } from '../../lib/use-visible-section';
import { useFriendActivity } from '../../lib/use-friend-activity';
import { profileHref } from '../../lib/usernames';

function FriendFeed({user,revision,now}) {
  const [section,visible]=useVisibleSection();
  const feed=useFriendActivity(false,revision,visible&&revision!==undefined);
  return <section ref={section} className="circle-panel circle-feed" aria-labelledby="circle-feed-title" aria-busy={feed.loading}><p className="circle-kicker">DESCOBERTAS EM BOA COMPANHIA</p><h2 id="circle-feed-title">O que seus amigos andam vendo</h2>
    {!user?<CircleEmpty title="As histórias ficam melhores em companhia"><Link prefetch={false} href="/conta">Entre</Link> para acompanhar seu círculo.</CircleEmpty>:<>
      {!visible||feed.loading&&!feed.more?<CircleSkeleton/>:<ul className="circle-feed-list">{feed.rows.map(review=><li key={`${review.user_id}:${review.item_key}`}><Link prefetch={false} className="circle-feed-author" href={profileHref(review)}><ProfileAvatar lazySigning profile={review}/><strong>{review.display_name||`@${review.username}`}</strong></Link><FriendReview review={review} excerpt now={now}/></li>)}</ul>}
      {feed.error&&<div className="circle-error" role="alert"><p>Não foi possível carregar as novidades do seu círculo.</p><button onClick={feed.more?feed.loadMore:feed.refresh}>Tentar novamente</button></div>}
      {visible&&!feed.loading&&!feed.error&&!feed.rows.length&&<CircleEmpty icon="sparkle" title="Seu círculo ainda tem muito para descobrir">Quando seus amigos avaliarem algo, aparece aqui.</CircleEmpty>}
      {feed.has_more&&!feed.error&&<button className="circle-load-more" disabled={feed.loading} onClick={feed.loadMore}>{feed.loading?'Carregando…':'Ver mais'}</button>}
      <span className="circle-sr-only" role="status" aria-live="polite">{feed.loading?'Carregando avaliações':`${feed.rows.length} avaliações de amigos carregadas.`}</span>
    </>}
  </section>;
}

export default memo(FriendFeed);
