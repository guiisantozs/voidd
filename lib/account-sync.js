/**
 * Serialize work per account without coupling a new account to an old request.
 * Downloads requested during upload are queued, never silently discarded.
 * @template T
 * @param {(id: string, pull: boolean) => Promise<T>} sync
 * @returns {(id: string, pull?: boolean) => Promise<T>}
 */
export function createSyncQueue(sync) {
  /** @type {Map<string, {pull: boolean, promise: Promise<T>}>} */
  const active = new Map();
  /** @param {string} id @param {boolean} [pull] @returns {Promise<T>} */
  function run(id, pull = false) {
    const current = active.get(id);
    if (current) {
      if (!pull || current.pull) return current.promise;
      // An explicit download requested during an upload must not be silently dropped.
      return current.promise.catch(() => {}).then(() => run(id, true));
    }
    const promise = Promise.resolve()
      .then(() => sync(id, pull))
      .finally(() => {
        if (active.get(id) === entry) active.delete(id);
      });
    const entry = { pull, promise };
    active.set(id, entry);
    return entry.promise;
  }
  return run;
}
