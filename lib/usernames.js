export const RESERVED_USERNAMES = new Set(['admin','admins','administrator','administrador','moderador','moderator','void','suporte','support','api','root','login','logout','entrar','sair','perfil','profile','filmes','series','jogos','animes','universos','amigos','conta','cadastro','signup','signin','auth','oauth','settings','configuracoes','pessoas','users','user','u','www','mail','email','help','ajuda','about','sobre','oficial','official','staff','team','equipe','null','undefined','system','sistema','security','seguranca']);
export const normalizeUsername = value => typeof value==='string'?value.trim().replace(/^@/,'').toLowerCase():'';
export function usernameValid(value) {
  return typeof value==='string'&&value.length>=3&&value.length<=20&&/^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(value)&&!/[._]{2}/.test(value)&&!RESERVED_USERNAMES.has(value);
}
export function suggestUsername(name,attempt=0) {
  let base=String(name||'pessoa').split('@')[0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,20).replace(/[._]+$/,'');
  if(base.length<3)base=`${base||'pessoa'}_void`;
  if(RESERVED_USERNAMES.has(base))base=`${base}_1`;
  const suffix=attempt?`_${attempt}`:'';
  return base.slice(0,20-suffix.length).replace(/[._]+$/,'')+suffix;
}
export const profileHref = person => person&&typeof person==='object'&&usernameValid(person.username)?`/u/${encodeURIComponent(person.username)}`:`/pessoas/${encodeURIComponent(typeof person==='string'?person:person?.user_id||'')}`;
export function usernameError(error) {
  if(error?.message?.includes('NAME_PROHIBITED'))return 'Este nome não pode ser utilizado. Escolha outro nome para continuar.';
  if(error?.code==='23505')return 'Esse @ já está em uso ou reservado. Escolha outro.';
  if(error?.message?.includes('USERNAME_COOLDOWN'))return 'Você pode alterar seu @ apenas uma vez a cada 30 dias.';
  if(error?.message?.includes('USERNAME_INVALID')||error?.code==='23514')return 'Confira o formato do @ e o prazo de alteração.';
  if(error?.message?.includes('RATE_LIMIT'))return 'Muitas tentativas. Aguarde um minuto e tente novamente.';
  return 'Não foi possível salvar seu @. Tente novamente.';
}
export async function withIdentities(client,rows=[]) {
  const ids=[...new Set(rows.map(row=>row.user_id).filter(Boolean))].slice(0,50);
  if(!client||!ids.length)return rows;
  const {data,error}=await client.rpc('void_identities',{ids});
  if(error)throw error;
  const people=new Map((data||[]).map(p=>[p.user_id,p]));
  return rows.map(row=>({...row,...people.get(row.user_id)}));
}
