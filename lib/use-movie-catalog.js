import { useCallback, useEffect, useRef, useState } from 'react';
import { movieSectionKeys } from './movie-sections';
import {publicCatalog} from './public-catalog-client.js';

export function useCatalogSections({basePath='/api/filmes',initial=movieSectionKeys}={}) {
  const [sections, setSections] = useState({});
  const controllers = useRef(new Map());
  const load=useCallback(async(section, page = 1) => {
    controllers.current.get(section)?.abort();
    const controller = new AbortController();
    controllers.current.set(section, controller);
    setSections(previous => ({ ...previous, [section]: { loading: true, page } }));
    try {
      const data = await publicCatalog.request(`${basePath}/${section}?page=${page}`, { signal: controller.signal });
      if (!controller.signal.aborted) setSections(previous => ({ ...previous, [section]: { ...data, loading: false } }));
    } catch (error) {
      if (!controller.signal.aborted) setSections(previous => ({ ...previous, [section]: { error: error.message, loading: false, page } }));
    }
  },[basePath]);
  const initialKey=initial.join(',');
  useEffect(() => {
    initialKey.split(',').filter(Boolean).forEach(section => load(section));
    return () => { controllers.current.forEach(controller => controller.abort()); controllers.current.clear(); };
  }, [initialKey,load]);
  return { sections, load };
}
export function useMovieCatalog(){return useCatalogSections({initial:['hero']});}
