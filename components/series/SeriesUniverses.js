import Link from 'next/link';
import Icon from '../Icon';
import {seriesUniverses} from '../../config/series-universes';
import {seriesUniverseHref} from '../../lib/shared-universes';

export default function SeriesUniverses({id}){
  const rows=seriesUniverses.filter(row=>row.entries.some(([seriesId])=>String(seriesId)===String(id)));
  return <section className="sd-universes"><h2>Universos</h2>{rows.length?rows.map(row=><p key={row.slug}><Link className="u-member-link" href={seriesUniverseHref(row.slug)}>Faz parte do universo {row.nome} <Icon name="arrow-right"/></Link></p>):<p className="md-muted">Esta série ainda não faz parte de um universo da nossa seleção.</p>}<Link href="/series/universos">Explorar universos de séries <Icon name="arrow-up-right"/></Link></section>;
}
