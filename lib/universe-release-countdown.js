// Calendar days in São Paulo: a release date does not imply a launch hour.
export function universeReleaseDays(date,now=Date.now()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(now))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(part=>[part.type,part.value]));
  const target=Date.parse(`${date}T00:00:00Z`),today=Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  return Number.isFinite(target)?Math.max(0,Math.round((target-today)/86400000)):null;
}
