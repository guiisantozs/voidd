import { useRouter } from 'next/router';
import { CollectionGamePage } from '../../../components/games/GameCollection';
export default function ConnectedGame() { const router = useRouter(); return router.isReady && typeof router.query.id === 'string' ? <CollectionGamePage id={router.query.id} target={typeof router.query.target === 'string' ? router.query.target : undefined} /> : <p role="status">Carregando jogo…</p>; }
