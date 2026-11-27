import Head from 'next/head';
import { GamesHeader, GamesFooter } from '../GameUI';
import LibrarySurface from './LibraryVisuals';

export default function GameUniverseShell({ title, description, children, className = '' }) {
  return <LibrarySurface className={`games-shell game-universes universes-page library-design ${className}`}><Head><title>{title} — VOID</title><meta name="description" content={description || 'Explore os universos de jogos do VOID.'} /></Head><GamesHeader />{children}<GamesFooter /></LibrarySurface>;
}
