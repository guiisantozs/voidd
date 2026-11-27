export default function ReviewVisibility({ user, profile, isPublic, onChange, switchControl=false }) {
  if (!user) return <p className="muted">Como visitante, sua avaliação fica apenas neste navegador. Entre na sua conta para compartilhar.</p>;
  return <div className="void-review-visibility">
    <label><input type="checkbox" role={switchControl?'switch':undefined} checked={!isPublic} onChange={event => onChange(!event.target.checked)}/> Manter avaliação privada</label>
    <p>{isPublic ? <>Avaliação pública, usando {profile?.display_name ? <><strong>{profile.display_name}</strong>{profile.username && <> <span>@{profile.username}</span></>}</> : 'o nome e o @ do seu perfil'}. A visibilidade do seu perfil continua valendo.</> : 'Avaliação privada. Só você pode vê-la.'}</p>
  </div>;
}
