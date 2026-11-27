import { useEffect, useState } from 'react';
import { editorialGames, filterGames } from './games';
import { hasGenre } from './game-filters';
import { GAME_CATALOG_CONFIGURATION_MESSAGE } from './game-catalog-error.js';
import {publicCatalog,SEARCH_DELAY_MS,shortSearch} from './public-catalog-client.js';

export function useGameSearch({ query, platform, genre, order, library, year = '', tag = '', developer = '', publisher = '', enabled = true }) {
  const [result, setResult] = useState({ items: editorialGames, editorial: true, hasNext: false, total: editorialGames.length });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const filterKey = JSON.stringify([query.trim(), platform, genre, order, year, tag, developer, publisher]);
  const [pageKey, setPageKey] = useState(filterKey);
  const currentPage = pageKey === filterKey ? page : 1;
  useEffect(() => { setPage(1); setPageKey(filterKey); }, [filterKey]);
  function changePage(next) { setPageKey(filterKey); setPage(next); }
  useEffect(() => {
    if (library || !enabled) { setLoading(false); return; }
    if(shortSearch(query)){
      setResult({items:[],editorial:false,hasNext:false,total:0});setNotice('Digite pelo menos duas letras para buscar por título.');setLoading(false);return;
    }
    if (year && (!/^\d{4}$/.test(year) || +year < 1950 || +year > 2099)) {
      setResult({ items: [], editorial: true, hasNext: false, total: 0 });
      setNotice('Informe um ano entre 1950 e 2099.'); setLoading(false); return;
    }
    const controller = new AbortController();
    setLoading(true); setNotice('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), platform, genre, order, page: String(currentPage), year, tag, developer, publisher });
        const data = await publicCatalog.request(`/api/jogos?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult({ items: data.jogos || [], editorial: false, hasNext: !!data.pagination?.hasNext, total: data.pagination?.total ?? 0, totalIsLowerBound:!!data.totalIsLowerBound });
      } catch (error) {
        if (controller.signal.aborted) return;
        const items = tag||developer||publisher?[]:filterGames(editorialGames, { query, platform, order }).filter(item => hasGenre(item, genre) && (!year || String(item.ano) === year));
        setResult({ items, editorial: true, hasNext: false, total: items.length });
        const reason = error.code === 'GAME_CATALOG_CONFIGURATION' ? GAME_CATALOG_CONFIGURATION_MESSAGE : 'O catálogo online está indisponível.';
        setNotice(`${reason} ${tag||developer||publisher?'Não foi possível aplicar este filtro. Tente novamente.':'A busca mostra somente os jogos da seleção editorial.'}`);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, SEARCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filterKey, currentPage, attempt, library, enabled]);
  return { ...result, loading, notice, page: result.editorial ? 1 : currentPage, changePage,
    retry: () => setAttempt(value => value + 1) };
}
