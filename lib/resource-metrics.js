// Bounded, process-local counters. Labels must be fixed route templates, never
// URLs, search terms, tokens, user IDs or request bodies.
export function createResourceMetrics({clock=Date.now}={}) {
  const rows=new Map();
  return {
    record(label,event,duration=0) {
      if(!rows.has(label)&&rows.size>=100)return;
      const row=rows.get(label)||{requests:0,hits:0,misses:0,deduplicated:0,errors:0,limited:0,durationMs:0};
      if(Object.hasOwn(row,event))row[event]++;
      if(event==='requests')row.durationMs+=Math.max(0,duration);
      rows.set(label,row);
    },
    snapshot(){return {scope:'local instance; not provider billing',at:clock(),rows:Object.fromEntries([...rows].map(([key,row])=>[key,{...row,averageMs:row.requests?Math.round(row.durationMs/row.requests):0}]))};},
    reset(){rows.clear();},
  };
}
export const resourceMetrics=createResourceMetrics();

// Optional aggregate server logs, no timer, no telemetry service or database.
let nextLog=0;
export function logResourceMetrics(){
  if(typeof window==='undefined'&&process.env.VOID_RESOURCE_METRICS==='1'&&Date.now()>=nextLog){
    nextLog=Date.now()+60000;
    console.info('[void:resources]',JSON.stringify(resourceMetrics.snapshot()));
  }
}
