// Server instance only. No private response cache, telemetry or distributed lock.
export function retryAfterSeconds(value, now = Date.now()) {
  if (value == null || value === '') return 60;
  const seconds = /^\d+(?:\.\d+)?$/.test(String(value).trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60;
}
export function consumptionError(status = 429, retryAfter = 60) {
  return Object.assign(new Error('Serviço temporariamente indisponível'), {status, retryAfter, consumptionLimited:true});
}
export function createProviderGuard({concurrency=6, maxQueue=100, minuteBudget=0, dailyBudget=0, failureThreshold=5, cooldownMs=30000, clock=Date.now, record=()=>{}} = {}) {
  let active=0, blockedUntil=0, failures=0, minute=-1, day=-1, minuteCalls=0, dailyCalls=0;
  const queue=[], pending=new Map();
  function check() {
    const now=clock(), nextMinute=Math.floor(now/60000), nextDay=Math.floor(now/86400000);
    if (minute!==nextMinute) {minute=nextMinute; minuteCalls=0;}
    if (day!==nextDay) {day=nextDay; dailyCalls=0;}
    if (now<blockedUntil) throw consumptionError(429, Math.ceil((blockedUntil-now)/1000));
    if (minuteBudget && minuteCalls>=minuteBudget) throw consumptionError(429, Math.ceil(((minute+1)*60000-now)/1000));
    if (dailyBudget && dailyCalls>=dailyBudget) throw consumptionError(429, Math.ceil(((day+1)*86400000-now)/1000));
  }
  function pump() {
    while (active<concurrency && queue.length) {
      const job=queue.shift();
      try {check();} catch(error) {record('limited'); job.reject(error); continue;}
      active++; minuteCalls++; dailyCalls++;
      Promise.resolve().then(job.load).then(value => {failures=0; job.resolve(value);}, error => {
        if (error.status===429 || (error.status===503 && error.retryAfter)) blockedUntil=Math.max(blockedUntil,clock()+(error.retryAfter||60)*1000);
        if (error.status>=500 || ['TypeError','TimeoutError','AbortError','SyntaxError'].includes(error.name)) {
          failures++;
          if (failures>=failureThreshold) {blockedUntil=Math.max(blockedUntil,clock()+cooldownMs); failures=0;}
        }
        job.reject(error);
      }).finally(() => {active--; pump();});
    }
  }
  return {
    run(key, load) {
      if (pending.has(key)) {record('deduplicated'); return pending.get(key);}
      try {check();} catch(error) {record('limited'); return Promise.reject(error);}
      if (queue.length>=maxQueue && active>=concurrency) {record('limited'); return Promise.reject(consumptionError(503,1));}
      const promise=new Promise((resolve,reject) => {queue.push({load,resolve,reject});});
      pending.set(key,promise); pump();
      // Attach both handlers without creating an unhandled rejecting finally chain.
      promise.then(() => pending.delete(key), () => pending.delete(key));
      return promise;
    },
  };
}

export function createSearchLimiter({limit=90, maxClients=2000, clock=Date.now} = {}) {
  const clients=new Map();
  return key => {
    const now=clock();
    if (!clients.has(key) && clients.size>=maxClients) {
      for (const [id,row] of clients) if (now-row.at>=60000) clients.delete(id);
      if (clients.size>=maxClients) return 60;
    }
    const old=clients.get(key)||{tokens:limit,at:now};
    const tokens=Math.min(limit, old.tokens + Math.max(0,now-old.at)*limit/60000);
    if (tokens<1) {clients.set(key,{tokens,at:now}); return Math.ceil((1-tokens)*60/limit);}
    clients.set(key,{tokens:tokens-1,at:now}); return 0;
  };
}
