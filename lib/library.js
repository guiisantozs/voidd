import { journeyTimestamp, transitionJourney } from './game-journey.js';

export const LIBRARY_KEY = 'void:library:v1';
export const LIBRARY_EVENT = 'void:library-changed';
export const gameStatuses = [
  { key: 'want', label: 'Quero jogar' },
  { key: 'playing', label: 'Em andamento' },
  { key: 'playing_now', label: 'Jogando agora', storageStatus: 'playing' },
  { key: 'paused', label: 'Pausado' },
  { key: 'abandoned', label: 'Abandonado', storageStatus: 'paused' },
  { key: 'finished', label: 'Finalizado' },
  { key: 'platinum', label: 'Platinado / 100%', storageStatus: 'finished' },
];

// Extra states remain compatible with deployed clients and the library constraint.
// The detail is personal metadata, subject to the same private library policies.
export function gameStatusKey(record) {
  const detail = gameStatuses.find(option => option.key === record?.statusDetail);
  return detail?.storageStatus && detail.storageStatus === record?.status ? detail.key : record?.status || '';
}

export function readLibrary(storage) {
  const data = JSON.parse(storage.getItem(LIBRARY_KEY) || '{}');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Biblioteca inválida');
  for (const [id, record] of Object.entries(data)) {
    if (!record || !gameStatuses.some(status => status.key === record.status)
      || record.item?.categoria !== 'jogos' || String(record.item.id) !== id
      || typeof record.item.titulo !== 'string') throw new Error('Biblioteca inválida');
  }
  return data;
}

export function setGameStatus(storage, item, status, now = new Date()) {
  if (item?.categoria !== 'jogos' || !/^[1-9][0-9]*$/.test(String(item.id)) || typeof item.titulo !== 'string') throw new Error('Jogo inválido');
  if (status !== '' && !gameStatuses.some(option => option.key === status)) throw new Error('Status inválido');
  // Lê o estado mais recente antes de alterar somente este jogo.
  const library = readLibrary(storage);
  const prior = library[item.id];
  const option = gameStatuses.find(option => option.key === status);
  if (status) {
    const { statusDetail: oldDetail, presence: oldPresence, ...metadata } = prior || {};
    library[item.id] = { ...metadata, item, status: option.storageStatus || status,
      ...(option.storageStatus ? { statusDetail: status } : {}),
      ...(status === 'playing_now' ? { presence: { source: 'manual', marked_at: now.toISOString() } } : {}),
      ...transitionJourney(prior, gameStatusKey(prior), status, now), atualizadoEm: now.toISOString() };
  }
  else delete library[item.id];
  storage.setItem(LIBRARY_KEY, JSON.stringify(library));
  return library;
}

export function setGameDates(storage, item, dates, now = new Date()) {
  const library = readLibrary(storage);
  const prior = library[String(item.id)];
  if (item?.categoria !== 'jogos' || !prior) throw Error('MISSING_LIBRARY_ENTRY');
  const patch = {};
  for (const key of ['started_at', 'finished_at']) if (Object.hasOwn(dates, key)) patch[key] = journeyTimestamp(dates[key]);
  library[String(item.id)] = { ...prior, ...patch, atualizadoEm: now.toISOString() };
  storage.setItem(LIBRARY_KEY, JSON.stringify(library));
  return library;
}

export function libraryGames(library, reviews) {
  const items = new Map();
  Object.values(reviews).forEach(review => {
    if (review?.item?.categoria === 'jogos') items.set(String(review.item.id), review.item);
  });
  Object.values(library).forEach(record => items.set(String(record.item.id), record.item));
  return [...items.values()];
}
