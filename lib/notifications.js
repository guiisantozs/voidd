export const notificationTypes = {
  work_recommendation: 'Um amigo recomendou uma obra',
  friend_game_review: 'Amigo publicou uma avaliação de jogo',
  list_invite: 'Convite para uma lista colaborativa',
  friend_request: 'Convite de amizade recebido', friend_accepted: 'Convite aceito',
  follower: 'Novo seguidor', review_like: 'Curtida na minha review',
  review_comment: 'Comentário ou resposta na minha review', mention: 'Menção ao meu @',
  achievement: 'Conquista desbloqueada', watchlist_review: 'Amigo avaliou um filme de Ver depois',
};

export function notificationPeriod(now = Date.now()) {
  const until = new Date(now);
  return { since: new Date(until.getTime() - 24 * 60 * 60 * 1000).toISOString(), until: until.toISOString() };
}

export function notificationReadSnapshot(rows=[],openedAt=Date.now()) {
  return [...new Set(rows.filter(row=>!row.read_at&&Date.parse(row.created_at)<=openedAt).map(row=>row.id).filter(Boolean))];
}
export async function markNotificationSnapshot(client,owner,ids,now=new Date()) {
  const snapshot=[...new Set(ids)];if(!owner||!snapshot.length)return [];
  const changed=[];
  for(let offset=0;offset<snapshot.length;offset+=100){
    const {data,error}=await client.from('notifications').update({read_at:now.toISOString()}).eq('user_id',owner).is('read_at',null).in('id',snapshot.slice(offset,offset+100)).select('id');
    if(error)throw error;changed.push(...(data||[]).map(row=>row.id));
  }
  return changed;
}

export function notificationQuery(client, owner, { now = Date.now(), unread = false, count = false } = {}) {
  const period = notificationPeriod(now);
  let query = client.from('notifications')
    .select(count ? 'id' : '*', count ? { count: 'exact', head: true } : undefined)
    .eq('user_id', owner).gte('created_at', period.since).lte('created_at', period.until);
  if (unread) query = query.is('read_at', null);
  return query;
}

export function groupNotifications(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = ['review_like', 'review_comment'].includes(row.type)
      ? `${row.type}:${row.entity_id}:${row.created_at.slice(0, 10)}:${!!row.read_at}` : row.id;
    if (!groups.has(key)) groups.set(key, { ...row, ids: [], actors: new Set() });
    const group = groups.get(key);
    group.ids.push(row.id);
    if (row.actor_id) group.actors.add(row.actor_id);
  }
  return [...groups.values()];
}

export function notificationText(row) {
  const name = row.data?.actor_name || 'Pessoa do Void';
  const extra = Math.max(0, (row.actors?.size || 1) - 1);
  const who = extra ? `${name} e mais ${extra} ${extra === 1 ? 'pessoa' : 'pessoas'}` : name;
  const title = row.data?.title ? ` de ${row.data.title}` : '';
  return ({work_recommendation:`${name} recomendou ${row.data?.title||'uma obra'} para você`,list_invite: `${row.data?.actor_username?'@'+row.data.actor_username:name} convidou você para ${row.data?.title?'a lista “'+row.data.title+'”':'uma lista colaborativa'}`,friend_request: `${name} enviou um convite de amizade`, friend_accepted: `${name} aceitou seu convite`,
    follower: `${name} começou a seguir você`, review_like: `${who} ${extra ? 'curtiram' : 'curtiu'} sua review${title}`,
    review_comment: `${who} ${extra ? 'comentaram' : 'comentou'} na sua review${title}`,
    mention: `${name} mencionou você${row.data?.comment_id ? ' em um comentário' : ' em uma review'}`,
    achievement: 'Você desbloqueou uma conquista', friend_game_review: `Seu amigo ${name} avaliou ${row.data?.title || 'um jogo'}`, watchlist_review: `${name} avaliou ${row.data?.title || 'um filme'} de Ver depois`})[row.type] || 'Nova notificação';
}

export function notificationHref(row) {
  if(row.type==='work_recommendation'){const item=row.data?.work;if(item&&/^[1-9][0-9]{0,14}$/.test(String(item.id))&&['filmes','series','jogos','animes'].includes(item.categoria))return item.categoria==='filmes'?`/filme/${item.id}`:`/obra/${item.categoria}/${item.id}`;return '/notificacoes';}
  if(row.type==='list_invite')return `/listas/convites?lista=${encodeURIComponent(row.entity_id)}`;
  if (row.type === 'friend_request') return '/amigos?aba=convites';
  if (row.entity_type === 'review') {
    const [owner, ...key] = row.entity_id.split('/');
    const item = key.join('/');
    if (/^filmes:[1-9][0-9]*$/.test(item)) return `/filme/${item.split(':')[1]}?tab=reviews&review=${encodeURIComponent(owner)}${row.data?.comment_id ? '&comments=1' : ''}`;
    if (/^jogos:[1-9][0-9]*$/.test(item)) return `/obra/jogos/${item.split(':')[1]}#comunidade`;
    if (/^(series|animes):[1-9][0-9]*$/.test(item)) return `/obra/${item.split(':')[0]}/${item.split(':')[1]}?tab=reviews&review=${encodeURIComponent(owner)}${row.data?.comment_id?'&comments=1':''}`;
    return `/pessoas/${encodeURIComponent(owner)}`;
  }
  if (row.actor_id) return `/pessoas/${encodeURIComponent(row.actor_id)}`;
  return '/perfil';
}
