// One mounted account/context owns this queue. Events during a read require one
// trailing read; repeated focus/subscription notifications only join the read.
export function createRefreshQueue(load) {
  let pending = null, dirty = false, disposed = false;
  return {
    refresh({changed = false} = {}) {
      if (disposed) return Promise.resolve();
      if (pending) { dirty ||= changed; return pending; }
      pending = (async () => {
        do { dirty = false; await load(); } while (dirty && !disposed);
      })().finally(() => { pending = null; });
      return pending;
    },
    dispose() { disposed = true; dirty = false; },
    cancelTrailing() { dirty = false; },
  };
}
