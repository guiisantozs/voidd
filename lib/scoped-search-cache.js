// Short-lived memory for one mounted people selector. Never persistent/public.
export function createScopedSearchCache({clock=Date.now,ttl=15000,limit=20}={}){
  let current;const rows=new Map();
  return {
    get(scope,key){
      if(scope!==current){rows.clear();current=scope;}
      const row=rows.get(key);if(row?.expires>clock())return structuredClone(row.data);
      rows.delete(key);return null;
    },
    set(scope,key,data){
      if(scope!==current)return;
      if(rows.size>=limit)rows.delete(rows.keys().next().value);
      rows.set(key,{data:structuredClone(data),expires:clock()+ttl});
    },
    clear(){rows.clear();},
  };
}
