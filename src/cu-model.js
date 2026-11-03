function norm(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
export function normalizeCuName(name){return norm(name).replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/\s+/g,' ').trim();}
function cuNamesMatch(a,b){
  const tokens=value=>normalizeCuName(value).split(' ').filter(Boolean).filter(token=>token.length>1);
  const left=tokens(a), right=tokens(b);
  return left.join(' ')===right.join(' ') || (left.length===right.length && left.every((token,index)=>token===right[index]));
}
function partyBucket(value){
  const party=norm(value).replace(/[^a-z]/g,'');
  if(!party) return null;
  if(party.startsWith('dem')) return 'dem';
  if(party.startsWith('rep')) return 'rep';
  return 'ind';
}
function isStatewide(contest){
  const district=norm(contest?.districtLabel||contest?.district||'');
  return district===''||district==='state'||district==='statewide';
}
function allowsCompositionFallback(contest){
  if(isStatewide(contest)) return true;
  const office=norm(contest?.position||contest?.office||contest?.race);
  return /state house|state senate|u s house|us house|congressional/.test(office);
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
  const key=cuContestKey(contest); const data=model?.contests?.[key]||{};
  const party=partyBucket(focus?.party);
  const name=normalizeCuName(focus?.name);
  let candidate=null;
  let kind='direct';
  if(data.candidates && !Array.isArray(data.candidates)){ const hit=Object.entries(data.candidates).find(([label])=>cuNamesMatch(label,name)); if(hit) candidate={name:hit[0],share:hit[1]}; } else if(Array.isArray(data.candidates)){ candidate=data.candidates.find(c=>cuNamesMatch(c.name,name)); }
  if(!candidate && key==='generic-congressional-ballot' && (party==='dem'||party==='rep')) { const share=data[party]; if(Number.isFinite(Number(share))) { candidate={name:party.toUpperCase(),share}; kind='generic'; } }
  if(!candidate && allowsCompositionFallback(contest) && party && model?.composition){
    const share=Number(model.composition[party]);
    if(Number.isFinite(share)){ candidate={name:focus?.name||party.toUpperCase(),share}; kind='composition'; }
  }
  if(!candidate) return null;
  const share=Number(candidate.share); const uncertainty=Number(data.uncertainty??model.sample?.likelyVoterCredibleInterval); if(!Number.isFinite(share)) return null;
  const u=Number.isFinite(uncertainty)?uncertainty:0; const marginUncertainty=Number(data.marginUncertainty??model.sample?.likelyVoterMarginCredibleInterval??u*2);
  return {key,share,uncertainty:u,marginUncertainty:Number.isFinite(marginUncertainty)?marginUncertainty:u*2,interval:[Math.max(0,share-u),Math.min(1,share+u)],label:kind==='generic'?'Generic congressional ballot context':kind==='composition'?'CU weighted partisan composition':'CU statewide estimate',kind,observations:data.observations||null, sampleN:model.sample?.likelyVoterN||null};
}
export function cuMeasureEstimate(model, issueId){const data=model?.measures?.[issueId]; if(!data) return null; const uncertainty=Number(data.uncertainty??model.sample?.likelyVoterCredibleInterval); return {...data,uncertainty:Number.isFinite(uncertainty)?uncertainty:0,interval:[Math.max(0,Number(data.yes)-uncertainty),Math.min(1,Number(data.yes)+uncertainty)]};}

// Funding shifts the measure-specific CU baseline without replacing it. The
// pseudo-count keeps a zero-dollar side from creating a 100% forecast.
export function ballotFundingEstimate({baselineShare, yesFunding, noFunding, influence=.3, smoothing=1}={}){
  const baseline=Number(baselineShare), yes=Number(yesFunding), no=Number(noFunding);
  if(!Number.isFinite(baseline)||baseline<0||baseline>1||!Number.isFinite(yes)||!Number.isFinite(no)||yes<0||no<0||(yes+no)<=0) return null;
  const pseudo=Math.max(0,Number(smoothing)||0), fundingShare=(yes+pseudo)/(yes+no+(2*pseudo));
  const weight=Math.min(.35,Math.max(0,Number(influence)));
  const estimate=Math.max(0,Math.min(1,baseline+weight*(fundingShare-baseline)));
  return {baselineShare:baseline, fundingShare, estimate, influence:weight, smoothing:pseudo, yesFunding:yes, noFunding:no};
}
