import {useRouter} from 'next/router';
import {useAccount} from '../../../components/AccountProvider';
import {GamesHeader,GamesFooter} from '../../../components/GameUI';
import {ListContent} from '../../listas/[id]';
export default function GameListPage(){
  const router=useRouter(),{user}=useAccount();
  return <div className="movies-page games-shell lists-page game-lists-page"><GamesHeader/>{router.isReady&&<ListContent key={`${user?.id||'guest'}:${router.query.id}`} id={router.query.id} basePath="/jogos/listas"/>}<GamesFooter/></div>;
}
