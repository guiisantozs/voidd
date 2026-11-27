import Icon from '../Icon';
import { FEED_STATUS } from '../../lib/reviews-feed';

export const FEED_OPTIONS = {
  period: [['today','Hoje'],['week','Esta semana'],['month','Últimos 30 dias'],['all','Sempre']],
  platform: [['','Todas'],['pc','PC'],['playstation','PlayStation'],['xbox','Xbox'],['nintendo','Nintendo']],
  genre: [['','Todos'],['action','Ação'],['adventure','Aventura'],['role-playing-games-rpg','RPG'],['strategy','Estratégia'],['shooter','Tiro'],['puzzle','Puzzle'],['racing','Corrida'],['sports','Esportes'],['indie','Indie']],
  status: [['','Todos'], ...['finished','platinum','playing','abandoned'].map(key => [key, FEED_STATUS[key].label])],
  text: [['all','Texto e notas'],['with','Só com texto'],['ratings','Só notas, sem texto']],
  sort: [['recent','Mais recentes'],['likes','Mais curtidas'],['highest','Maiores notas'],['lowest','Menores notas'],['comments','Mais comentadas']],
};
export const FILTER_LABELS = { period:'Período',platform:'Plataforma',genre:'Gênero',status:'Status do autor',text:'Conteúdo',minRating:'Nota mínima',maxRating:'Nota máxima',q:'Jogo' };
export function chipLabel(key, value) { return `${FILTER_LABELS[key]}: ${FEED_OPTIONS[key]?.find(option => option[0] === value)?.[1] || value}`; }
export default function FeedFilters({ filters, change, fields=['period','platform','genre','status','text'] }) {
  return <div className="gr-filter-fields">{fields.map(key => <label key={key}>{FILTER_LABELS[key]}<select value={filters[key]} onChange={event => change({ [key]: event.target.value })}>{FEED_OPTIONS[key].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
    <fieldset><legend><Icon name="star"/> Faixa de notas / 5</legend><label>Mínima<input type="number" min="0" max="5" step="0.1" value={filters.minRating} onChange={event => change({ minRating: event.target.value })}/></label><label>Máxima<input type="number" min="0" max="5" step="0.1" value={filters.maxRating} onChange={event => change({ maxRating: event.target.value })}/></label></fieldset>
  </div>;
}
