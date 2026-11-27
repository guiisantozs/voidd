import Link from 'next/link';
import GameCover from '../GameCover';
import { rememberGame } from '../GameUI';
import { workHref } from '../../lib/work-client';
import GamePlatformIcons from './GamePlatformIcons';

// Shared by the release showcase and the personal library.
export default function GameCoverCard({ item, badge, overlay, children, footer, className = '', status, tabIndex, portraitOnly = false, href }) {
  return <article className={`upcoming-cover-card ${className}`} data-status={status}>
    <Link tabIndex={tabIndex} className="upcoming-cover-link" href={href || workHref(item)} onClick={() => {if(item.id)rememberGame(item);}}>
      <div className="upcoming-art"><GameCover item={item} portraitOnly={portraitOnly} />{badge}
        <div className="game-cover-platforms"><GamePlatformIcons item={item} /></div>{overlay}
      </div><h3>{item.titulo}</h3>
    </Link>
    {children}<div className="upcoming-card-footer">{footer}</div>
  </article>;
}
