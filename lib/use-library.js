import { useEffect, useState } from 'react';
import { LIBRARY_EVENT, readLibrary, setGameStatus, setGameDates, gameStatusKey } from './library';
import { DATA_EVENT, scopedStorage } from './account-storage';
import { GAME_STATUS_SAVED } from './game-journey';
import { useAccount } from '../components/AccountProvider';

export function useLibrary() {
  const { user } = useAccount();
  const owner = user?.id || null;
  const [entries, setEntries] = useState({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    function refresh(event) {
      try { setEntries(readLibrary(scopedStorage(localStorage))); setError(''); }
      catch { setError('Não foi possível ler sua biblioteca. Os dados existentes foram preservados.'); }
      setReady(true);
    }
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(LIBRARY_EVENT, refresh);
    window.addEventListener(DATA_EVENT, refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(LIBRARY_EVENT, refresh); window.removeEventListener(DATA_EVENT, refresh); };
  }, []);
  function update(item, status) {
    try {
      const storage = scopedStorage(localStorage, owner);
      const previous = gameStatusKey(readLibrary(storage)[String(item.id)]);
      const next = setGameStatus(storage, item, status);
      setEntries(next); setError('');
      window.dispatchEvent(new Event(LIBRARY_EVENT));
      window.dispatchEvent(new CustomEvent(GAME_STATUS_SAVED, { detail: { item, status, previous, owner } }));
      return true;
    } catch { setError('Não foi possível salvar. Verifique o armazenamento do navegador; seus registros anteriores foram preservados.'); return false; }
  }
  function updateDates(item, dates) {
    try {
      const next = setGameDates(scopedStorage(localStorage, owner), item, dates);
      setEntries(next); setError(''); window.dispatchEvent(new Event(LIBRARY_EVENT)); return true;
    } catch { setError('Não foi possível salvar as datas. Confira os valores e o armazenamento do navegador.'); return false; }
  }
  return { entries, ready, error, update, updateDates };
}
