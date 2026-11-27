import { useRouter } from 'next/router';
import { validTab } from './navigation-tabs';

export function useRouteTab(keys, fallback = keys[0], parameter = 'aba') {
 const router = useRouter();
 const selected = validTab(router.query[parameter], keys, fallback);
 function select(value) {
  if (!keys.includes(value) || selected === value) return;
  router.push({ pathname: router.pathname, query: { ...router.query, [parameter]: value } }, undefined, { shallow: true, scroll: false });
 }
 return [selected, select];
}
