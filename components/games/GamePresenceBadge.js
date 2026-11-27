import {gameStatusKey} from '../../lib/library';
export default function GamePresenceBadge({record}){
  return gameStatusKey(record)==='playing_now'?<span className="gp-now-playing" aria-label="Jogando agora, marcado manualmente"><i aria-hidden="true"/>Jogando agora<small>Manual</small></span>:null;
}
