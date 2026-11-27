import { platforms } from '../../lib/games';
import { libraryMatchesPlatform } from '../../lib/game-library-filters';

// Shared by recommendation and upcoming covers; these are local brand assets.
export default function GamePlatformIcons({ item }) {
  const supported = platforms.filter(platform => platform.key !== 'all' && libraryMatchesPlatform(item,platform.key.toLowerCase()));
  if (!supported.length) return null;
  return <div className="game-platform-icons">{supported.map(platform => <span key={platform.key} title={platform.label}><img src={platform.logo} alt={platform.label} width={18} height={18} loading="lazy"/></span>)}</div>;
}
