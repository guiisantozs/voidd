import { useEffect,useRef } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../AccountProvider';
import { scopedStorage,REVIEWS_KEY } from '../../lib/account-storage';
import { GAME_STATUS_SAVED,GAME_REVIEW_REQUESTED,shouldOfferFinishReview,skipFinishReview } from '../../lib/game-journey';
import { gameReviewHref } from '../../lib/game-review-navigation';

// One destination, no secondary editor/modal. Status has already been persisted
// before this event; navigation failure or ignoring the form cannot undo it.
export default function FinishReviewHub(){
  const {user}=useAccount(),router=useRouter(),inFlight=useRef(false);
  const owner=user?.id||null;
  useEffect(()=>{
    function receive(event){
      const detail=event.detail;
      if(!detail||detail.owner!==owner||inFlight.current)return;
      try{
        const reviews=JSON.parse(scopedStorage(localStorage,owner).getItem(REVIEWS_KEY)||'{}');
        let session;try{session=sessionStorage;}catch{ /* Session storage is optional. */ }
        if(!shouldOfferFinishReview(session,owner,detail.item,detail.status,detail.previous,reviews))return;
        const href=gameReviewHref(detail.item.id);if(!href)return;
        skipFinishReview(session,owner,detail.item.id);
        if(router.asPath.split(/[?#]/)[0]===href.split('#')[0]){
          window.dispatchEvent(new CustomEvent(GAME_REVIEW_REQUESTED,{detail:{id:String(detail.item.id),owner,source:'status'}}));
        }else{
          inFlight.current=true;
          Promise.resolve(router.push(href)).catch(()=>{}).finally(()=>{inFlight.current=false;});
        }
      }catch{ /* A corrupt review store must not be overwritten by an automatic flow. */ }
    }
    window.addEventListener(GAME_STATUS_SAVED,receive);
    return()=>window.removeEventListener(GAME_STATUS_SAVED,receive);
  },[owner,router.asPath]);
  return null;
}
