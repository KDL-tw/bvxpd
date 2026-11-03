function norm(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
export function normalizeCuName(name){return norm(name).replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/\s+/g,' ').trim();}
function cuNamesMatch(a,b){
  const tokens=value=>normalizeCuName(value).split(' ').filter(Boolean).filter(token=>token.length>1);
  const left=tokens(a), right=tokens(b);
  return left.join(' ')===right.join(' ') || (left.length===right.length && left.every((token,index)=>token===right[index]));
}
export function cuContestKey(contest){
  const office=norm(contest?.position||contest?.office||contest?.race);
  if(/u s senate|us senate|senate/.test(office) && !/state house|state senate/.test(office)) return 'us-senate';
  if(/governor/.test(office) && !/lieutenant/.test(office)) return 'governor';
  if(/secretary of state/.test(office)) return 'secretary-of-state';
  if(/attorney general/.test(office)) return 'attorney-general';
  if(/u s house|us house|congressional/.test(office)) return 'generic-congressional-ballot';
  return null;
}
export function cuContestEstimate(model, contest, focus){
  const key=cuContestKey(contest); const data=model?.contests?.[key]; if(!data) return null;
  const party=String(focus?.party||'').toLowerCase().replace(/[^a-z]/g,'');
  const name=normalizeCuName(focus?.name);
  let candidate=null;
  let kind='direct';
  if(data.candidates && !Array.isArray(data.candidates)){ const hit=Object.entries(data.candidates).find(([label])=>cuNamesMatch(label,name)); if(hit) candidate={name:hit[0],share:hit[1]}; } else if(Array.isArray(data.candidates)){ candidate=data.candidates.find(c=>cuNamesMatch(c.name,name)); }
  if(!candidate && key==='generic-congressional-ballot' && (party==='dem'||party==='rep')) { const share=data[party]; if(Number.isFinite(Number(share))) { candidate={name:party.toUpperCase(),share}; kind='generic'; } }
  if(!candidate) return null;
  const share=Number(candidate.share); const uncertainty=Number(data.uncertainty??model.sample?.likelyVoterCredibleInterval); if(!Number.isFinite(share)) return null;
  const u=Number.isFinite(uncertainty)?uncertainty:0; const marginUncertainty=Number(data.marginUncertainty??model.sample?.likelyVoterMarginCredibleInterval??u*2);
  return {key,share,uncertainty:u,marginUncertainty:Number.isFinite(marginUncertainty)?marginUncertainty:u*2,interval:[Math.max(0,share-u),Math.min(1,share+u)],label:kind==='generic'?'Generic congressional ballot context':'CU statewide estimate',kind,observations:data.observations||null, sampleN:model.sample?.likelyVoterN||null};
}
export function cuMeasureEstimate(model, issueId){const data=model?.measures?.[issueId]; if(!data) return null; const uncertainty=Number(data.uncertainty??model.sample?.likelyVoterCredibleInterval); return {...data,uncertainty:Number.isFinite(uncertainty)?uncertainty:0,interval:[Math.max(0,Number(data.yes)-uncertainty),Math.min(1,Number(data.yes)+uncertainty)]};}
