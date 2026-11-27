import Icon from '../Icon';

export default function FeedAudienceSwitch({ audience, onChange, className }) {
  return <div className={className} role="group" aria-label="Origem das avaliações">
    <button type="button" aria-pressed={audience==='community'} onClick={()=>onChange('community')}><Icon name="globe"/>Comunidade</button>
    <button type="button" aria-pressed={audience==='friends'} onClick={()=>onChange('friends')}><Icon name="users"/>Amigos</button>
  </div>;
}
