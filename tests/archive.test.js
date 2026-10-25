import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateArchive} from '../src/archive.js';
import {summarize} from '../src/data.js';
const archive=JSON.parse(readFileSync(new URL('../data/historical/co-2022-general.json',import.meta.url)));
test('frozen source bytes match recorded checksums',()=>{
  for(const source of archive.sources){const bytes=readFileSync(new URL('../data/sources/co-2022-general/'+source.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);}
});
test('all ten races reconcile and source metadata does not invent reporting time',()=>{
  const snapshot=validateArchive(archive);assert.equal(snapshot.records.length,1381);assert.equal(new Set(snapshot.records.map(r=>r.race)).size,10);assert.equal(snapshot.asOf,null);assert.equal(snapshot.electionDate,'2022-11-08');assert.equal(snapshot.kind,'observed');
});
test('statewide totals and district recount margin match official abstract',()=>{
  const senate=summarize(archive.records,'United States Senator');assert.equal(senate.total,2500201);assert.equal(senate.areas,64);assert.equal(senate.candidates.find(c=>c.name==='Michael Bennet').votes,1397170);
  const governor=summarize(archive.records,'Governor/Lieutenant Governor');assert.equal(governor.total,2508830);assert.equal(governor.areas,64);
  const cd3=summarize(archive.records,'U.S. House · District 3');assert.equal(cd3.total,327286);assert.equal(cd3.candidates[0].name,'Lauren Boebert');assert.equal(cd3.candidates[0].votes-cd3.candidates[1].votes,546);
  const cd8=summarize(archive.records,'U.S. House · District 8');assert.equal(cd8.candidates[0].votes,114377);assert.equal(cd8.candidates[1].votes,112745);
});
test('county filtering retains real zero counts and write-in candidates',()=>{
  const adams=summarize(archive.records,'United States Senator','Adams');assert.equal(adams.total,159288);assert.equal(adams.candidates.length,9);assert.ok(adams.candidates.some(c=>c.name.includes('(Write-in)')&&c.votes===0));
});
test('tampered counts, duplicated races or missing coverage fail archive validation',()=>{
  const modified=structuredClone(archive);modified.records[0].votes++;assert.throws(()=>validateArchive(modified),/reconcile/);
  const missing=structuredClone(archive);missing.records=missing.records.filter(r=>r.race!=='U.S. House · District 8');assert.throws(()=>validateArchive(missing),/coverage/);
  const duplicate=structuredClone(archive);duplicate.reconciliation[0]=duplicate.reconciliation[1];assert.throws(()=>validateArchive(duplicate),/race check/);
});
test('contest identity uses election, position and district, independent of candidate names',()=>{
  const snapshot=validateArchive(archive);
  const house=snapshot.contests.filter(c=>c.positionId==='us-house');
  assert.deepEqual(house.map(c=>c.district),['1','2','3','4','5','6','7','8']);
  assert.equal(house[7].id,'co-2022-general:us-house:8');
  assert.ok(snapshot.records.filter(r=>r.race==='U.S. House · District 8').every(r=>r.contestId===house[7].id));
  const changed=structuredClone(archive);
  for(const r of changed.records)if(r.candidate==='Yadira Caraveo')r.candidate='Replacement candidate';
  changed.reconciliation.find(c=>c.race==='U.S. House · District 8').candidateTotals.find(c=>c.candidate==='Yadira Caraveo').candidate='Replacement candidate';
  assert.equal(validateArchive(changed).contests.find(c=>c.district==='8').id,house[7].id);
  changed.contests.find(c=>c.district==='8').district='7';assert.throws(()=>validateArchive(changed),/identity/);
});
