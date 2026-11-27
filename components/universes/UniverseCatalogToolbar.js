import {UniverseProgress} from './UniverseUI';

export default function UniverseCatalogToolbar({id,filter,onFilterChange,user,error,seen,total,media='all'}) {
  const allowed=!!user&&!error;
  const label=media==='series'?'séries':media==='filmes'?'filmes':'filmes e séries';
  return <div className="u-catalog-toolbar">
    {allowed&&<UniverseProgress seen={seen} total={total} label={`Você avaliou ${seen} de ${total} ${label}`}/>}
    <div className="u-controls"><div className="u-catalog-filter"><label htmlFor={id}>Mostrar conteúdos</label><select id={id} value={allowed?filter:'all'} onChange={event=>onFilterChange(event.target.value)}><option value="all">Todos</option><option value="seen" disabled={!allowed}>Avaliados</option><option value="unseen" disabled={!allowed}>Não avaliados</option></select></div></div>
  </div>;
}
