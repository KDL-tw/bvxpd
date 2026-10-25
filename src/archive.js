import {fields, normalize, summarize} from './data.js';

// Bundled archives have their own provenance contract; manual imports still require a source timestamp.
export function validateArchive(snapshot) {
  if(snapshot?.schemaVersion!==1 || snapshot.id!=='co-2022-general-abstract-v1' || snapshot.kind!=='observed' || snapshot.stage!=='archived' || snapshot.provenance!=='bundled-archive') throw Error('Unsupported historical archive.');
  if(snapshot.electionDate!=='2022-11-08' || snapshot.asOf!==null || !Number.isFinite(Date.parse(snapshot.retrievedAt))) throw Error('Invalid archive dates.');
  if(!Array.isArray(snapshot.records) || !snapshot.records.length || !Array.isArray(snapshot.reconciliation)) throw Error('Missing archive records or reconciliation.');
  const records=normalize({headers:fields,rows:snapshot.records.map(r=>fields.map(f=>String(r[f]??'')))},Object.fromEntries(fields.map((f,i)=>[f,i])));
  const races=[...new Set(records.map(r=>r.race))];
  if(races.length!==10 || snapshot.reconciliation.length!==10) throw Error('Historical race coverage mismatch.');
  for(const race of races) {
    const checks=snapshot.reconciliation.filter(c=>c.race===race);
    if(checks.length!==1) throw Error('Missing or duplicate race check.');
    const check=checks[0], result=summarize(records,race);
    if(result.total!==check.totalVotes || result.areas!==check.countyCount || result.candidates.length!==check.candidateCount) throw Error('Historical race totals do not reconcile.');
    if(result.candidates.some(c=>check.candidateTotals.filter(t=>t.candidate===c.name&&t.votes===c.votes).length!==1)) throw Error('Historical candidate totals do not reconcile.');
    if(!/^https:\/\/www\.sos\.state\.co\.us\/pubs\/elections\/Results\/Abstract\/2022\/general\/[a-zA-Z]+\.html$/.test(check.url) || !/^[a-f0-9]{64}$/.test(check.sha256)) throw Error('Invalid historical source provenance.');
  }
  if(!Array.isArray(snapshot.contests) || snapshot.contests.length!==races.length || new Set(snapshot.contests.map(c=>c.id)).size!==races.length) throw Error('Invalid contest identities.');
  for(const race of races){
    const matches=snapshot.contests.filter(c=>c.race===race);
    if(matches.length!==1)throw Error('Missing position/district mapping.');
    const c=matches[0], house=/^U.S. House · District ([1-8])$/.exec(race);
    const positionId=house?'us-house':race==='United States Senator'?'us-senate':race==='Governor/Lieutenant Governor'?'governor-lt-governor':null;
    const district=house?house[1]:'statewide';
    if(!positionId || c.positionId!==positionId || c.district!==district || c.id!==`co-2022-general:${positionId}:${district}`)throw Error('Invalid position/district identity.');
    if(snapshot.records.some(r=>r.race===race&&r.contestId!==c.id))throw Error('Record contest identity mismatch.');
  }
  return {...snapshot, records:records.map((r,i)=>({...r,contestId:snapshot.records[i].contestId}))};
}
