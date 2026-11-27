// One batched resolver per client. Existing social RPC signatures stay compatible.
const clients = new WeakMap();
export function avatarIdentityStore(client) {
  if (clients.has(client)) return clients.get(client);
  const cache = new Map(), listeners = new Set(), pending = new Set(); let timer, generation = 0;
  const notify = () => { for (const listener of listeners) listener(); };
  function schedule() { if (!timer) timer = setTimeout(flush, 16); }
  async function flush() {
    timer = null; const ids = [...pending].slice(0, 50); ids.forEach(id => pending.delete(id));
    if (!ids.length) return;
    const token = generation;
    try {
      const { data, error } = await client.rpc('void_avatar_identities', { ids });
      if (error) throw error;
      if (token === generation) { const found = new Map((data || []).map(row => [row.user_id, row])); for (const id of ids) cache.set(id, { value: found.get(id) || null, until: Date.now() + 60000 }); notify(); }
    } catch { if (token === generation) { for (const id of ids) cache.set(id, { value: null, until: Date.now() + 15000 }); notify(); } }
    if (pending.size) schedule();
  }
  const store = {
    get(id) { const entry = cache.get(id); if (!entry || entry.until <= Date.now()) { pending.add(id); schedule(); } return entry?.until > Date.now() ? entry.value : null; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate(id) { generation++; if (id) cache.delete(id); else cache.clear(); notify(); },
    seed(id, value) { generation++; cache.set(id, { value, until: Date.now() + 60000 }); notify(); },
  };
  clients.set(client, store); return store;
}
