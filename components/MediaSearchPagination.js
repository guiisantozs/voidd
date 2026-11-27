import Icon from './Icon';

export default function MediaSearchPagination({search}){
  const {results,page,changePage}=search;
  if(results.loading||results.error||!results.pagination||(page===1&&!results.pagination.hasNext))return null;
  return <nav className="media-search-pagination" aria-label="Páginas da busca de obras">
    <button type="button" disabled={page<=1} onClick={()=>changePage(page-1)}><Icon name="arrow-left"/> Anterior</button>
    <span>Página {page}</span>
    <button type="button" disabled={!results.pagination.hasNext} onClick={()=>changePage(page+1)}>Próxima <Icon name="arrow-right"/></button>
  </nav>;
}
