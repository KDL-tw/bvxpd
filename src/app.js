import {validateArchive} from './archive.js';
import {plannedPredictionCatalog, validatePrediction, historicalBaseline, fundraisingAdjustedBaseline, testFundraisingHypothesis, remainingVoteBeta, allChoiceCount, kalmanFilter, markovRegimes, spatialAssociation, ASSUMED_FUNDING_SLOPE} from './predictions.js';
import {contestSeat, pastVoteAverages} from './vote-averages.js';
import {fanPoints, pathToVictory, projectionCompare, remainingFromFinal, scenarioBoard, turnoutScenarios} from './scenarios.js';
document.getElementById('file-warning')?.remove();
import {splashUrl} from './config.js';
import {fields,parseFile,parseDelimited,suggestedMapping,normalize,validateMeta,summarize,demo} from './data.js';
import {contestFundingAdvantage, normalizeTracerExport} from './finance.js';
const financeKey='bullvixen.finance.normalized.v1';
const tipPp='Percentage points — the gap between two percentages. A 2 pp lead means 51% to 49%, not twice as large.';
function loadFinance(){try{const raw=JSON.parse(localStorage.getItem(financeKey)||'[]'); return Array.isArray(raw)?raw:[];}catch{return [];}}
function moneyFmt(n){return Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});}
function opponentLines(opponents){if(!opponents.length) return ''; if(opponents.length===1) return ` · Opponent ${fmt(opponents[0].votes)}`; return opponents.map((c,i)=>` · Opponent ${i+1} ${esc(c.name)} ${fmt(c.votes)}`).join('');}
function focusAndOpponents(sum, focusKey){const focus=sum.candidates.find(c=>(c.party||c.name)===focusKey)||sum.candidates[0]; const opponents=sum.candidates.filter(c=>c!==focus); return {focus, opponents, focusVotes:focus?.votes||0, otherVotes:opponents.reduce((n,c)=>n+c.votes,0)};}
function seatFunding(entry, focusKey, mode='opponent'){const finance=loadFinance(); if(!finance.length||!entry||!focusKey) return null; const sum=summarize(entry.file.records,entry.race); const {focus, opponents}=focusAndOpponents(sum, focusKey); if(!focus) return null; const focusNames=sum.candidates.filter(c=>partyNorm(c.party)===partyNorm(focusKey)||partyNorm(c.name)===partyNorm(focusKey)||c.party===focusKey||c.name===focusKey).map(c=>c.name); const names=focusNames.length?focusNames:[focus.name]; return contestFundingAdvantage(finance,{focusNames:names, opponentNames:opponents.map(c=>c.name), position:entry.position||'', district:entry.district||'', mode});}
function fundCompareLabel(hit){if(!hit) return ''; if(hit.mode==='category') return `avg ${hit.category} ${moneyFmt(hit.categoryAverage)}`; return `opponent ${moneyFmt(hit.opponentReceipts)}`;}
function fundNote(hit){if(!hit) return 'Import a TRACER file on Imports to calculate funding advantage. Choose vs opponent or vs office-category average. Equal money is 0; positive means the focus side raised more.'; return `From TRACER: focus ${moneyFmt(hit.focusReceipts)} vs ${fundCompareLabel(hit)} → advantage ${hit.advantage.toFixed(3)} (log₁₀). Override the number or the influence slider as a what-if.`;}
const $=id=>document.getElementById(id), fmt=n=>n.toLocaleString('en-US');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='bullvixen.snapshots.v1', pinKey='bullvixen.pins.v1', currentElectionId='co-2026-general-candidates', currentElectionYear=2026; let archives=[],snapshots=[],watchlist=[],pins=[],predictions=[],researchDrops=[],mode='observed',selectedId='',race='',position='All positions',county='All imported areas',table=null,draft=null,fileToken=0,liveSnapshot=null,turnoutArchive=null,turnoutArchive2022=null,detail=null;
const time=s=>s?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Denver'}).format(new Date(s))+' MT':'No timestamp';

function persistResearchDrops(){try{localStorage.setItem('bullvixen.research.drops.v1',JSON.stringify(researchDrops));return true;}catch{toast('Couldn\'t save scenario drops in this browser.');return false;}}
function researchDropsFor(snapshotId,contest){return researchDrops.filter(d=>d.snapshotId===snapshotId&&d.contest===contest);}
function removeResearchDrop(id){researchDrops=researchDrops.filter(d=>d.id!==id); if(!persistResearchDrops()) return; renderResearch(); toast('Scenario drop removed.');}
function clearResearchDrops(snapshotId,contest){researchDrops=researchDrops.filter(d=>!(d.snapshotId===snapshotId&&d.contest===contest)); if(!persistResearchDrops()) return; renderResearch(); toast('Scenario drops cleared for this contest.');}

function toast(message){$('toast').textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').textContent='',6500);}
try {const saved=JSON.parse(localStorage.getItem(key)||'[]'); if(!Array.isArray(saved)) throw Error(); snapshots=saved.map(s=>{validateMeta(s); if(!Array.isArray(s.records)||!s.id||!Number.isFinite(Date.parse(s.importedAt))) throw Error(); normalize({headers:fields,rows:s.records.map(r=>fields.map(f=>String(r[f]??'')))},Object.fromEntries(fields.map((f,i)=>[f,i]))); return s;}); const watches=JSON.parse(localStorage.getItem('bullvixen.watchlist')||'[]'); if(Array.isArray(watches)) watchlist=watches.filter(s=>typeof s==='string'); const savedPredictions=JSON.parse(localStorage.getItem('bullvixen.predictions.v1')||'[]'); if(Array.isArray(savedPredictions)) predictions=savedPredictions; const savedResearchDrops=JSON.parse(localStorage.getItem('bullvixen.research.drops.v1')||'[]'); if(Array.isArray(savedResearchDrops)) researchDrops=savedResearchDrops;}catch{toast('Saved data could not be read. Import a file to keep going. Nothing already stored was overwritten.');snapshots=[];}
function save(next){try{localStorage.setItem(key,JSON.stringify(next)); snapshots=next;return true;}catch{toast('This browser can\'t store that. Download a backup, remove an old snapshot, and try again.');return false;}}
try {const raw=JSON.parse(localStorage.getItem(pinKey)||'[]'); if(Array.isArray(raw)) pins=raw.filter(p=>p&&typeof p.id==='string'&&typeof p.snapshotId==='string'&&typeof p.race==='string');} catch {pins=[];}
function snapshotById(id){return id==='demo'?demo:allSnapshots().find(s=>s.id===id)||null;}
function pinOf(snapshotId,raceName){return pins.find(p=>p.snapshotId===snapshotId&&p.race===raceName);}
function persistPins(){try{localStorage.setItem(pinKey,JSON.stringify(pins));return true;}catch{toast('Couldn\'t save the watch list. It will last for this visit only.');return false;}}
function partyClass(p){return /^rep/i.test(p)?'rep':/^dem/i.test(p)?'':'other';}
function tone(p){return partyClass(p)||'dem';}
function officeAdds(office,raceName){const n=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,''); const a=n(office),b=n(raceName); return !!a&&!(a===b||b.startsWith(a)||a.startsWith(b));}
function sharePct(votes,total){return total?votes/total*100:0;}
function personRow(c,total){const pct=sharePct(c.votes,total); return `<div class="candidate"><div class="candidate-head"><div>${esc(c.name)}<small>${esc(c.party||'No party')}</small></div><div class="number"><strong class="${tone(c.party)}">${pct.toFixed(2)}%</strong><small>${fmt(c.votes)} votes</small></div></div><div class="bar" aria-hidden="true"><span class="${partyClass(c.party)}" style="width:${pct}%"></span></div></div>`;}
function brief(snapshot,raceName){const summary=summarize(snapshot.records,raceName),lead=summary.candidates[0],next=summary.candidates[1];return {snapshot,race:raceName,summary,lead,next,margin:lead&&next?(summary.total?(lead.votes-next.votes)/summary.total*100:0):null,office:snapshot.contests?.find(c=>c.race===raceName)?.position||''};}
function togglePin(snapshotId,raceName){const i=pins.findIndex(p=>p.snapshotId===snapshotId&&p.race===raceName); if(i>=0) pins.splice(i,1); else pins.push({id:crypto.randomUUID(),snapshotId,race:raceName,note:'',savedAt:null}); if(!persistPins()) return; renderNow(); renderWatches();}
function savePinNote(snapshotId,raceName,note){let pin=pinOf(snapshotId,raceName); if(!pin){pin={id:crypto.randomUUID(),snapshotId,race:raceName,note:'',savedAt:null}; pins.push(pin);} pin.note=note.trim(); pin.savedAt=new Date().toISOString(); if(!persistPins()) return; toast(pin.note?'Note saved on this browser.':'Watch saved on this browser.'); renderNow(); renderWatches();}
function adoptLooseWatches(){if(!watchlist.length) return; for(const name of watchlist){const hit=[...allSnapshots(),demo].find(s=>Array.isArray(s.records)&&s.records.some(r=>r.race===name)); const snapshotId=hit?.id||''; if(!pinOf(snapshotId,name)) pins.push({id:crypto.randomUUID(),snapshotId,race:name,note:'',savedAt:null});} watchlist=[]; try{localStorage.removeItem('bullvixen.watchlist');}catch{} persistPins();}
function openFull(snapshotId,raceName){const snap=snapshotById(snapshotId); if(!snap){toast('That file is no longer open.'); return;} mode=snap.kind==='demo'?'demo':'observed'; selectedId=snap.id; position='All positions'; county='All imported areas'; race=raceName; render(); page('overview'); requestAnimationFrame(()=>document.querySelector('#race-cards .selected')?.scrollIntoView({block:'center'}));}
function cardHtml(item,watched){const {snapshot,race:raceName,summary,lead,next,margin,office,note,mark}=item,selected=detail&&detail.snapshotId===snapshot.id&&detail.race===raceName,leadPct=lead?sharePct(lead.votes,summary.total):0,nextPct=next?sharePct(next.votes,summary.total):0,rest=Math.max(0,100-leadPct-nextPct),showOffice=officeAdds(office,raceName); return `<article class="forward-card${selected?' selected':''}${watched?' watching':''}"><button type="button" class="card-open" data-open-card="${esc(snapshot.id)}" data-race="${esc(raceName)}">${showOffice||mark?`<span class="card-kicker">${showOffice?`<span>${esc(office)}</span>`:'<span></span>'}${mark?'<span class="closest">Closest</span>':''}</span>`:''}<b>${esc(raceName)}</b><span class="margin-line"><span>Margin</span><strong class="${margin!=null&&summary.total&&margin<1?'tight':''}">${margin!=null?margin.toFixed(2)+' pp':'—'}</strong></span><span class="who"><strong>${esc(lead?.name||'No names')}</strong><span class="pct ${tone(lead?.party)}">${lead?leadPct.toFixed(2)+'%':'—'}</span></span><span class="split" aria-hidden="true">${lead&&leadPct?`<i class="${tone(lead.party)}" style="flex:${leadPct} 1 0"></i>`:''}${next&&nextPct?`<i class="${tone(next.party)}" style="flex:${nextPct} 1 0"></i>`:''}${rest>0.05?`<i class="rest" style="flex:${rest} 1 0"></i>`:''}</span><span class="who runner">${next?`<strong>${esc(next.name)}</strong><span class="pct ${tone(next.party)}">${nextPct.toFixed(2)}%</span>`:'<strong>One name in the file</strong>'}</span>${watched?`<small class="card-file">${esc(snapshot.election)}</small>`:''}${note?`<small class="card-note">${esc(note)}</small>`:''}</button><button type="button" class="pin" data-pin="${esc(snapshot.id)}" data-race="${esc(raceName)}" aria-pressed="${watched?'true':'false'}">${watched?'Watching':'Watch'}</button></article>`;}
function renderNow(){
  const watched=pins.map(p=>{const snap=snapshotById(p.snapshotId); if(!snap?.records?.some(r=>r.race===p.race)) return {missing:true,pin:p}; const item=brief(snap,p.race); item.note=p.note; return item;});
  const ranked=watched.filter(item=>!item.missing&&item.summary.total>0&&item.margin!=null);
  const closest=ranked.length>1?ranked.reduce((a,b)=>a.margin<=b.margin?a:b):null;
  watched.forEach(item=>{if(!item.missing) item.mark=closest&&item.race===closest.race&&item.snapshot.id===closest.snapshot.id;});
  $('watched-cards').innerHTML=watched.length?watched.map(item=>item.missing?`<article class="forward-card"><button type="button" class="card-open" disabled><b>${esc(item.pin.race)}</b><small>That file is no longer open.</small></button><button type="button" class="pin" data-pin="${esc(item.pin.snapshotId)}" data-race="${esc(item.pin.race)}" aria-pressed="true">Remove</button></article>`:cardHtml(item,true)).join(''):'<p class="muted">No races watched.</p>';
  const panel=$('race-detail'), layout=$('now-layout');
  if(!detail){panel.hidden=true; layout.classList.remove('with-detail'); return;}
  const snap=snapshotById(detail.snapshotId);
  layout.classList.add('with-detail'); panel.hidden=false;
  if(!snap?.records?.some(r=>r.race===detail.race)){panel.innerHTML=`<p>That file is no longer open.</p><button type="button" id="detail-close">Close</button>`; $('detail-close').onclick=()=>{detail=null;renderNow();}; return;}
  const item=brief(snap,detail.race), pin=pinOf(snap.id,detail.race), typing=document.activeElement?.id==='pin-note'&&document.activeElement.dataset.snapshot===snap.id&&document.activeElement.dataset.race===detail.race?document.activeElement.value:null;
  const {summary,lead,next,margin}=item, ahead=lead&&next?lead.votes-next.votes:null;
  panel.innerHTML=`<div class="detail-actions"><button type="button" id="detail-close">Close</button><button type="button" id="detail-watch" aria-pressed="${pin?'true':'false'}">${pin?'Watching':'Watch'}</button></div>${officeAdds(item.office,item.race)?`<span class="eyebrow">${esc(item.office)}</span>`:''}<h2>${esc(item.race)}</h2><p class="muted">${esc(snap.election)}</p><div class="detail-hero"><span>Margin</span><strong>${margin!=null?margin.toFixed(2)+' pp':'—'}</strong>${ahead!=null?`<small>${fmt(ahead)} votes ahead</small>`:''}</div><div class="detail-stats"><div><span>Votes</span><strong>${fmt(summary.total)}</strong></div><div><span>Places</span><strong>${fmt(summary.areas)}</strong></div></div><div class="candidates">${summary.candidates.map(c=>personRow(c,summary.total)).join('')}</div><form id="detail-note"><label>Note<textarea id="pin-note" maxlength="240" data-snapshot="${esc(snap.id)}" data-race="${esc(detail.race)}">${esc(typing??pin?.note??'')}</textarea></label><button class="primary" type="submit">Save note</button></form>${pin?.savedAt?`<p class="muted">Saved ${esc(time(pin.savedAt))}</p>`:''}<button type="button" id="detail-full" class="full-width">Open the full race</button>`;
  if(typing!=null){$('pin-note').focus();}
  $('detail-close').onclick=()=>{detail=null;renderNow();};
  $('detail-watch').onclick=()=>togglePin(snap.id,item.race);
  $('detail-full').onclick=()=>openFull(snap.id,item.race);
  $('detail-note').onsubmit=e=>{e.preventDefault(); savePinNote(snap.id,item.race,$('pin-note').value);};
}
$('now').addEventListener('click',e=>{const pinBtn=e.target.closest('[data-pin]'); if(pinBtn){togglePin(pinBtn.dataset.pin,pinBtn.dataset.race); return;} const card=e.target.closest('[data-open-card]'); if(card){detail={snapshotId:card.dataset.openCard,race:card.dataset.race}; renderNow();}});
function page(id){if(!['now','overview','imports','history','research'].includes(id)) id='now';document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==id);document.querySelectorAll('nav button').forEach(el=>{el.classList.toggle('active',el.dataset.page===id); if(el.dataset.page===id)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}); if(id==='history')renderHistory(); if(id==='now')renderNow(); if(id==='research'){mountCalculators(); mountResearch();} location.hash=id;}
document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>page(el.dataset.page)));
window.addEventListener('hashchange',()=>page(location.hash.slice(1)));
const allSnapshots=()=>[...(liveSnapshot?[liveSnapshot]:[]),...snapshots,...archives];
const isArchive=s=>archives.includes(s);
function historicalFile(s){return !!s&&isArchive(s)&&s.id!==currentElectionId;}
function currentYearFile(s){return !!s&&!historicalFile(s)&&(s.id===currentElectionId||new RegExp(`\\b${currentElectionYear}\\b`).test(s.election||''));}
function currentFirst(files){return [...files.filter(s=>s.id===currentElectionId),...files.filter(s=>s.id!==currentElectionId&&currentYearFile(s)),...files.filter(s=>s.id!==currentElectionId&&!currentYearFile(s))];}
function active(){return mode==='demo'&&selectedId==='demo'?demo:allSnapshots().find(s=>s.id===selectedId&&s.kind===mode);}
function setMode(value){mode=value; if(value==='demo') selectedId='demo'; else if(!allSnapshots().some(s=>s.id===selectedId&&s.kind==='observed')) selectedId=allSnapshots().find(s=>s.id===currentElectionId)?.id||allSnapshots().find(s=>s.kind==='observed'&&currentYearFile(s))?.id||''; race='';position='All positions';county='All imported areas';render();}
$('observed-mode').onclick=()=>setMode('observed');$('demo-mode').onclick=$('explore-demo').onclick=()=>setMode('demo');
function options(el,items,value){el.innerHTML=items.map(([v,label])=>`<option value="${esc(v)}">${esc(label)}</option>`).join('');el.value=value;el.disabled=!items.length;}
function render(){
  const files=mode==='demo'?[demo,...snapshots.filter(s=>s.kind==='demo')]:allSnapshots().filter(s=>s.kind==='observed');
  const list=mode==='demo'?files:currentFirst(files);
  if(!list.some(s=>s.id===selectedId))selectedId=list.find(s=>s.id===currentElectionId)?.id||list.find(s=>currentYearFile(s))?.id||'';
  options($('snapshot'),list.map(s=>[s.id,isArchive(s)?s.election:`${s.election} · ${time(s.asOf)}`]),selectedId);
  const s=active(),allNames=s?[...new Set(s.records.map(r=>r.race))]:[];
  const contests=isArchive(s)?s.contests:allNames.map(n=>({race:n,position:'Unmapped position',districtLabel:n}));
  const positions=[...new Set(contests.map(c=>c.position))];
  if(!positions.includes(position))position='All positions';
  options($('position-select'),s?['All positions',...positions].map(p=>[p,p==='All positions'?'Every office':p==='Unmapped position'?'Office not in the file':p]):[],position);
  const names=contests.filter(c=>position==='All positions'||c.position===position).map(c=>c.race);
  if(!names.includes(race))race=names[0]||'';
  const areas=s?[...new Set(s.records.filter(r=>r.race===race).map(r=>r.county))].sort():[];
  if(!areas.includes(county))county='All imported areas';
  options($('race-select'),names.map(n=>[n,position==='All positions'?n:contests.find(c=>c.race===n).districtLabel]),race);options($('county-select'),s?['All imported areas',...areas].map(n=>[n,n==='All imported areas'?'Every place':n]):[],county);
  $('observed-mode').setAttribute('aria-pressed',String(mode==='observed'));$('demo-mode').setAttribute('aria-pressed',String(mode==='demo'));
  $('data-banner').classList.toggle('observed',mode==='observed');
  const currentFile=s?.id===currentElectionId;
  $('data-banner').textContent=mode==='demo'?'DEMO — Made-up names and votes, so you can click around. Not a real election.':s?.id==='live-results'?'LIVE — Whatever the feed sent on the last refresh. Check the source before you quote it.':currentFile?`${s.election} — 0% until November 3.` :s&&isArchive(s)?`ARCHIVE — ${s.election}. History that ships with the app, not a live count.` :s?'IMPORT — You brought this file. The source notes are saved; the totals were not audited.':'NOTHING LOADED — No observed file is open. This page does not go fetch results on its own.';
  $('empty').hidden=!!s;$('results').hidden=!s;
  renderWatches();
  if(!s){$('race-cards').replaceChildren();$('share-chart').replaceChildren();$('drop-chart').replaceChildren();$('drop-panel').hidden=true;renderNow();return;}
  const summary=summarize(s.records,race,county),{total,candidates}=summary;
  $('vote-total').textContent=fmt(total);$('race-total').textContent=fmt(allNames.length);$('area-total').textContent=fmt(summary.areas);
  $('margin').textContent=candidates.length>=2?(total?(candidates[0].votes-candidates[1].votes)/total*100:0).toFixed(2)+' pp':'—';
  $('race-heading').textContent=race;$('result-badge').textContent=mode==='demo'?'DEMO':currentFile?'CANDIDATES':isArchive(s)?'ARCHIVE':s.stage==='certified'?'SOURCE SAYS CERTIFIED':'UNOFFICIAL';
  $('candidates').innerHTML=candidates.map(c=>personRow(c,total)).join('');
  const archived=isArchive(s), check=archived?s.reconciliation?.find(c=>c.race===race):null, contest=contests.find(c=>c.race===race), sourceUrl=check?.url||s.url;
  const sourceLink=s.kind!=='observed'?'Demo data, not an election':sourceUrl?`<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">Open the source ↗</a>`:'No source link on this one';
  $('source-details').innerHTML=`<dt>Kind</dt><dd>${currentFile?'Candidate list':archived?'Bundled archive':s.kind==='observed'?'Your import':'Demo'}</dd><dt>Election</dt><dd>${esc(s.election)}</dd>${archived&&contest?`<dt>Office</dt><dd>${esc(contest.position)} · ${esc(contest.districtLabel)}</dd>`:''}<dt>Reported</dt><dd>${currentFile?'0 votes':archived?'Not in this archive':esc(time(s.asOf))}</dd>${archived?`<dt>Date</dt><dd>${esc(s.electionDate||'Not in this archive')}</dd>${s.retrievedAt?`<dt>Fetched</dt><dd>${esc(time(s.retrievedAt))}</dd>`:''}`:`<dt>Saved here</dt><dd>${esc(time(s.importedAt))}</dd>`}<dt>Stage</dt><dd>${currentFile?'Candidates certified':archived?'Final abstract':s.stage==='certified'?'Certified, according to the source':'Unofficial'}</dd><dt>File</dt><dd>${esc(check?.sourceFile||s.filename)}</dd><dt>Source</dt><dd>${sourceLink}</dd>${s.coverage?`<dt>Includes</dt><dd>${esc(s.coverage)}</dd>`:''}${check?.reconciliation?`<dt>Checked</dt><dd>${esc(check.reconciliation)}</dd>`:''}${check?.sha256?`<dt>SHA-256</dt><dd class="checksum">${esc(check.sha256)}</dd>`:''}`;
  $('storage-note').textContent=mode==='demo'?'Built-in demo numbers. Not your file, and not a real election.':s?.id==='live-results'?'This live response sits in memory for the session. Refresh the page and it is gone.':archived?'This set ships with the app. Files you import stay in this browser.':'This import stays in this browser. Other people do not see it.';
  const canDrop=!historicalFile(s);
  $('drop-panel').hidden=!canDrop;
  $('race-cards').innerHTML=names.map(n=>{const t=summarize(s.records,n),lead=t.candidates[0],next=t.candidates[1],leadPct=lead?sharePct(lead.votes,t.total):0,gap=lead&&next?sharePct(lead.votes-next.votes,t.total):null,watching=!!pinOf(s.id,n),drops=predictions.filter(x=>x.contest===n&&x.snapshotId===s.id),p=drops[drops.length-1];return `<article class="race-card ${race===n?'selected':''}"><button data-race="${esc(n)}"><b>${esc(n)}</b><span class="race-lead"><strong>${esc(lead?.name||'No names')}</strong><span class="pct ${tone(lead?.party)}">${lead?leadPct.toFixed(2)+'%':'—'}</span></span><small>${gap!=null?gap.toFixed(2)+' pp · ':''}${fmt(t.total)} votes · ${t.candidates.length} name${t.candidates.length===1?'':'s'}</small></button>${canDrop?`<button type="button" class="watch-eye" data-watch="${esc(n)}" aria-pressed="${watching?'true':'false'}" aria-label="${watching?'Stop watching':'Watch'}"><svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="${watching?'currentColor':'none'}" stroke="currentColor" stroke-width="2"/></svg></button><form class="card-drop" data-contest="${esc(n)}"><span>Your prediction</span><label>Expected votes<input type="number" min="0" step="1" name="votes" placeholder="0" value="${p?.votes??''}" required></label><label>Note<input name="provenance" placeholder="Why this number" value="${esc(p?.provenance??'')}" required></label><button type="submit">Save prediction</button>${p?`<small>Saved ${esc(time(p.createdAt))}</small>`:''}</form>`:''}</article>`;}).join('');
  const shareRows=candidates.slice(0,8);
  $('share-chart').innerHTML=shareRows.map(c=>{const pct=sharePct(c.votes,total); return `<div class="chart-row"><span>${esc(c.name)}</span><div><i class="${tone(c.party)}" style="width:${pct.toFixed(1)}%"></i></div><b class="${tone(c.party)}">${pct.toFixed(2)}%</b></div>`;}).join('')||'<p class="muted">No one in this slice.</p>';
  const drops=predictions.filter(x=>x.contest===race&&x.snapshotId===s.id).slice(-12); const maxDrop=Math.max(...drops.map(x=>x.votes),1);
  $('drop-chart').innerHTML=drops.length?`<div class="drop-bars">${drops.map((d,i)=>`<div><i style="height:${(d.votes/maxDrop*100).toFixed(1)}%"></i><small>${i+1}</small></div>`).join('')}</div>`:'<p class="muted">No drops on this race yet.</p>';
  $('race-cards').querySelectorAll('button[data-race]').forEach(b=>b.onclick=()=>{race=b.dataset.race;county='All imported areas';render();});$('race-cards').querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>{togglePin(s.id,b.dataset.watch);render();});$('race-cards').querySelectorAll('.card-drop').forEach(form=>form.onsubmit=e=>{e.preventDefault();if(historicalFile(s))return;const f=new FormData(form),votes=Number(f.get('votes')),provenance=String(f.get('provenance')).trim();if(!Number.isSafeInteger(votes)||votes<0||!provenance)return;const record={id:crypto.randomUUID(),contest:form.dataset.contest,snapshotId:s.id,votes,provenance,createdAt:new Date().toISOString(),kind:'modeled',schemaVersion:1};predictions=[...predictions,record];try{localStorage.setItem('bullvixen.predictions.v1',JSON.stringify(predictions));$('prediction-status').textContent=`Drop saved for ${record.contest} · ${time(record.createdAt)}.`;render();}catch{$('prediction-status').textContent='Couldn\'t save that drop in this browser.';}});renderWatches();renderNow(); if(!$('research').hidden) renderResearch();
}
$('position-select').onchange=e=>{position=e.target.value;race='';county='All imported areas';render();};
$('snapshot').onchange=e=>{selectedId=e.target.value;race='';position='All positions';county='All imported areas';render();};$('race-select').onchange=e=>{race=e.target.value;county='All imported areas';render();};$('county-select').onchange=e=>{county=e.target.value;render();};
function renderWatches(){const s=active(), mine=s?pins.filter(p=>p.snapshotId===s.id):[], el=$('watchlist'); if(!el) return; el.innerHTML=mine.length?mine.map(p=>`<div><div><button type="button" data-watch-open="${esc(p.race)}">${esc(p.race)}</button>${p.note?`<small>${esc(p.note)}</small>`:''}</div><button type="button" data-watch-remove="${esc(p.race)}" aria-label="Remove ${esc(p.race)}">Remove</button></div>`).join(''):'<p class="muted">No races in this file are watched.</p>'; el.querySelectorAll('[data-watch-open]').forEach(b=>b.onclick=()=>{race=b.dataset.watchOpen;county='All imported areas';render();}); el.querySelectorAll('[data-watch-remove]').forEach(b=>b.onclick=()=>{if(s) togglePin(s.id,b.dataset.watchRemove);}); const btn=$('watch-current'); if(btn){const on=!!(s&&race&&pinOf(s.id,race)); btn.disabled=!s||!race; btn.textContent=on?'Watching':'Watch this race'; btn.setAttribute('aria-pressed',String(on));}}
$('watch-current').onclick=()=>{const s=active(); if(s&&race) togglePin(s.id,race);};
function invalidate(){draft=null;$('preview').hidden=true;$('commit').disabled=true;}
$('import-form').addEventListener('input',invalidate);$('mapping').addEventListener('change',invalidate);
 $('finance-file').onchange=async()=>{const file=$('finance-file').files[0];if(!file)return;const status=$('finance-status');status.textContent='Reading the TRACER file…';try{const rows=parseDelimited(await file.text());const headers=rows.shift().map(x=>x.trim());const normalized=normalizeTracerExport(headers,rows,file.name);localStorage.setItem('bullvixen.finance.normalized.v1',JSON.stringify(normalized));status.textContent=`Turned ${rows.length.toLocaleString()} TRACER rows into ${normalized.length.toLocaleString()} records. Still only on this computer.`; mountCalculators(true);}catch(e){status.textContent=e.message;}};
$('file').onchange=async()=>{const token=++fileToken;invalidate();table=null;$('mapping').replaceChildren();const file=$('file').files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('Maximum file size is 10 MB.');if(!/\.(csv|tsv|json)$/i.test(file.name))throw Error('Choose a CSV, TSV or JSON file.');const text=await file.text();if(token!==fileToken)return;table=parseFile(text,file.name);const mapping=suggestedMapping(table.headers);$('mapping').innerHTML=fields.map(f=>`<label>${f==='candidate'?'Candidate / choice':f[0].toUpperCase()+f.slice(1)} ${['county','party'].includes(f)?'(optional)':'*'}<select id="map-${f}"><option value="-1">${f==='county'?'Statewide totals':f==='party'?'No party column':'Select column'}</option>${table.headers.map((h,i)=>`<option value="${i}" ${mapping[f]===i?'selected':''}>${esc(h)}</option>`).join('')}</select></label>`).join('');status(`${fmt(table.rows.length)} rows from ${file.name}. Check the column map before you save.`);}catch(e){if(token===fileToken)status(e.message,true);}};
function status(message,error=false){$('import-status').textContent=message;$('import-status').classList.toggle('error',error);}
$('import-form').onsubmit=e=>{e.preventDefault();invalidate();try{if(!table)throw Error('Pick a file first.');const election=String($('election').value||'').trim();if(!new RegExp(`\\b${currentElectionYear}\\b`).test(election))throw Error(`New imports are limited to the current ${currentElectionYear} election. Historical archives are read-only.`);const asOf=$('as-of').value.trim();if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(asOf))throw Error('Use a timestamp with a timezone, like 2026-11-03T19:00:00-07:00.');const meta=validateMeta({election,kind:$('kind').value,asOf,stage:$('stage').value,url:$('source-url').value.trim(),attested:$('attest').checked});const mapping=Object.fromEntries(fields.map(f=>[f,Number($('map-'+f).value)]));const records=normalize(table,mapping);draft={...meta,records,filename:$('file').files[0].name,id:crypto.randomUUID(),importedAt:new Date().toISOString(),schemaVersion:1};$('preview-body').innerHTML=records.slice(0,10).map(r=>`<tr>${[r.race,r.candidate,r.county,r.party,fmt(r.votes)].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('');$('preview-summary').textContent=`${meta.kind==='demo'?'DEMO':'OBSERVED'} · ${records.length} rows · ${new Set(records.map(r=>r.race)).size} races. Compare each race to the source before you save.`;$('preview').hidden=false;$('commit').disabled=false;status('Looks valid. Read the preview, then save.');}catch(err){status(err.message,true);}};
$('commit').onclick=()=>{if(!draft)return;if(snapshots.some(s=>s.kind===draft.kind&&s.election===draft.election&&s.asOf===draft.asOf&&JSON.stringify(s.records)===JSON.stringify(draft.records))){status('Already saved. Open it from Snapshots.',true);return;}if(snapshots.length>=20){status('That\'s the limit: 20 snapshots. Download one and delete it before saving another.',true);return;}if(!save([draft,...snapshots]))return;mode=draft.kind;selectedId=draft.id;race='';county='All imported areas';invalidate();render();renderHistory();mountCalculators();page('overview');toast('Saved in this browser. Older snapshots stay separate.');};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('template').onclick=()=>download('bullvixen-demo-template.csv','race,candidate,votes,county,party\nExample Governor,Example Candidate A,1500,Adams,DEM\nExample Governor,Example Candidate B,1400,Adams,REP\nExample House District 8,Example Candidate C,900,Adams,IND\n','text/csv');
$('export').onclick=()=>{const s=active();if(s){const {records,...meta}=s;download('bullvixen-'+s.id+'.json',JSON.stringify({...meta,results:records},null,2),'application/json');}};
function renderHistory(){
  const all=currentFirst(allSnapshots());
  $('history-list').innerHTML=all.length?all.map(s=>{const races=new Set(s.records.map(r=>r.race)).size, current=s.id===currentElectionId, home=current?'Current election':isArchive(s)?'Ships with the app':s.stage==='certified'?'Source says certified':'Unofficial'; return `<article class="panel history-row"><div class="history-main"><span class="badge">${current?'2026':isArchive(s)?'ARCHIVE':s.kind.toUpperCase()}</span><h2>${esc(s.election)}</h2><dl class="history-facts"><div><dt>${isArchive(s)?'Election day':'Reported'}</dt><dd>${esc(isArchive(s)?s.electionDate:time(s.asOf))}</dd></div><div><dt>File</dt><dd>${esc(s.filename)}</dd></div><div><dt>Rows</dt><dd>${fmt(s.records.length)}</dd></div><div><dt>Races</dt><dd>${fmt(races)}</dd></div><div><dt>Home</dt><dd>${home}</dd></div></dl></div><div class="actions"><button data-open="${esc(s.id)}">Open</button>${isArchive(s)?'':`<button data-delete="${esc(s.id)}">Delete</button>`}</div></article>`;}).join(''):'<div class="empty"><h2>Nothing saved yet.</h2><p>Confirmed imports and the bundled archives show up here.</p></div>';
  $('history-list').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const s=allSnapshots().find(s=>s.id===b.dataset.open);mode=s.kind;selectedId=s.id;race='';render();page('overview');});
  $('history-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this snapshot from this browser? Download a backup first if you still want it.')){if(save(snapshots.filter(s=>s.id!==b.dataset.delete))){render();renderHistory();mountCalculators();}}});
}
async function refreshLive(){
  const status=$('live-status'), button=$('refresh-live'); status.textContent='Checking the live feed…'; button.disabled=true;
  try {
    const response=await fetch('/api/live-results',{cache:'no-store'}); const payload=await response.json();
    if(!response.ok) throw Error(payload.error||'The live feed did not respond.');
    const rows=payload.records.map((r,i)=>({race:String(r.race||r.contest||''),candidate:String(r.candidate||r.choice||''),county:String(r.county||r.area||'Statewide'),party:String(r.party||''),votes:Number(r.votes)}));
    if(!rows.length||rows.some(r=>!r.race||!r.candidate||!Number.isSafeInteger(r.votes)||r.votes<0)) throw Error('The live feed sent rows this page can\'t read.');
    liveSnapshot={id:'live-results',kind:'observed',stage:'unofficial',election:payload.election||'Live Colorado results',asOf:payload.asOf||payload.fetchedAt,importedAt:payload.fetchedAt,filename:'Live feed',url:payload.sourceUrl||'',records:rows,schemaVersion:1};
    mode='observed'; selectedId='live-results'; race=''; position='All positions'; county='All imported areas'; render();
    status=`Live feed updated ${time(payload.fetchedAt)}`; toast('Live results are in.');
  } catch(error) { status.textContent=error.message; toast('Live results didn\'t load. The feed may not be set up.'); }
  finally { button.disabled=false; }
}
$('refresh-live').onclick=$('now-refresh').onclick=refreshLive;

async function loadArchives(){
  try {
    const current=await fetch('data/current/co-2026-general-candidates.json');
    const response=await fetch('data/historical/co-2022-general.json');
    if(!response.ok)throw Error('Archive unavailable');
    archives=[validateArchive(await response.json())];
    const legislative=await fetch('data/historical/co-2024-legislative.json'); if(legislative.ok) archives.push(await legislative.json());
    const senate2020=await fetch('data/historical/co-2020-state-senate.json'); if(senate2020.ok) archives.push(await senate2020.json());
    const house2020=await fetch('data/historical/co-2020-state-house.json'); if(house2020.ok) archives.push(await house2020.json());
    const senate2022=await fetch('data/historical/co-2022-state-senate.json'); if(senate2022.ok) archives.push(await senate2022.json());
    const house2022=await fetch('data/historical/co-2022-state-house.json'); if(house2022.ok) archives.push(await house2022.json());
    const ag2022=await fetch('data/historical/co-2022-attorney-general.json'); if(ag2022.ok) archives.push(await ag2022.json());
    const ag2018=await fetch('data/historical/co-2018-attorney-general.json'); if(ag2018.ok) archives.push(await ag2018.json());
    archives=archives.map(a=>({...a,kind:a.kind||'observed',election:a.election||a.label||a.id,filename:a.filename||`${a.id}.json`,url:a.url||a.sourceUrl,retrievedAt:a.retrievedAt||null}));
    if(current.ok){const file=await current.json(); archives.unshift({...file,kind:file.kind||'observed',election:file.election||file.label||file.id,filename:file.filename||`${file.id}.json`,url:file.url||file.sourceUrl||'',retrievedAt:file.retrievedAt||null});}
    const turnout2020=await fetch('data/historical/co-2020-turnout.json'); if(turnout2020.ok) turnoutArchive=await turnout2020.json();
    const turnout2022=await fetch('data/historical/co-2022-turnout.json'); if(turnout2022.ok) turnoutArchive2022=await turnout2022.json();
    selectedId=currentElectionId; mode='observed'; adoptLooseWatches(); render();renderHistory(); mountCalculators(true); mountResearch();
  }catch{adoptLooseWatches(); toast('The bundled history didn\'t load. Imports and the demo still work.'); render(); mountCalculators(true); mountResearch();}
}
const pct=n=>Number.isFinite(n)?(n*100).toFixed(2)+'%':'—';
let calcContests=[], calcStamp='';
function calculatorFiles(){return currentFirst([...archives,...snapshots.filter(s=>s.kind==='observed'&&Array.isArray(s.records)&&s.records.length)]);}
function partyNorm(value){const name=String(value||'').trim(); if(/^dem/i.test(name)) return 'dem'; if(/^rep/i.test(name)) return 'rep'; return name.toLowerCase();}
function partyShare(file,race,key,county='All imported areas'){const sum=summarize(file.records,race,county), want=partyNorm(key), hits=sum.candidates.filter(c=>partyNorm(c.party)===want||partyNorm(c.name)===want||c.party===key||c.name===key); if(!hits.length) return null; const votes=hits.reduce((n,c)=>n+c.votes,0); return {votes,total:sum.total,share:sum.total?votes/sum.total:0,name:hits.map(c=>c.name).join(', ')};}
function choiceList(entry){const sum=summarize(entry.file.records,entry.race), seen=new Set(), out=[]; for(const c of sum.candidates){const key=c.party||c.name; if(seen.has(key)) continue; seen.add(key); out.push({key,label:c.party?`${c.party} · ${c.name}`:c.name});} return out;}
function selectedContest(form){return calcContests[Number(form.contest.value)]||null;}
function showCalc(form,record,lines){const out=form.querySelector('.calc-out'); if(!record||record.unavailable){out.innerHTML=`<p>${esc(record?.reason||'Select a contest from the files.')}</p>`; return;} validatePrediction(record); out.innerHTML=`<dl>${lines.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;}
function fillChoices(form){const select=form.choice; if(!select) return; const previous=select.value, options=selectedContest(form)?choiceList(selectedContest(form)):[]; select.innerHTML=options.map(c=>`<option value="${esc(c.key)}">${esc(c.label)}</option>`).join(''); if(options.some(c=>c.key===previous)) select.value=previous;}
function fillHistory(form){const subject=selectedContest(form), key=form.choice?.value, box=form.querySelector('.calc-rows'), note=form.querySelector('[data-fund-note]'), histNote=form.querySelector('[data-history-note]'), apply=form.applyFund, manual=[...box.querySelectorAll('[data-kind=manual]')]; if(!subject||!key){box.replaceChildren(...manual); if(note) note.textContent=fundNote(null); if(histNote) histNote.textContent='Pick a contest and choice. Matching past seats from your files will fill in automatically.'; return;} const fundMode=form.fundBaseline?.value==='category'?'category':'opponent'; const matches=calcContests.filter(c=>sameSeat(subject,c)).map(c=>{const found=partyShare(c.file,c.race,key); return found?{c,found,hit:seatFunding(c,key,fundMode)}:null;}).filter(Boolean); const rows=matches.map(({c,found,hit},i)=>{const fund=hit!=null?hit.advantage.toFixed(4):''; const checked=i<3?' checked':''; return `<div class="calc-line" data-kind="file"><label class="check"><input type="checkbox" name="use"${checked}>${esc(c.election)} · ${esc(c.race)}</label><b data-share="${found.share}">${pct(found.share)}</b><label>Weight<input name="weight" type="number" min="0" step="0.1" value="1"></label><label title="log₁₀(focus receipts ÷ opponent receipts) from TRACER. Equal money = 0.">Funding advantage<input name="fund" type="number" step="any" value="${esc(fund)}" ${hit?'data-from-tracer="1"':''}></label>${hit?`<small class="calc-file">TRACER ${moneyFmt(hit.focusReceipts)} vs ${moneyFmt(hit.opponentReceipts)}</small>`:''}</div>`;}); box.innerHTML=rows.join(''); manual.forEach(node=>box.append(node)); if(histNote) histNote.textContent=matches.length?`${matches.length} compatible past contest${matches.length===1?'':'s'} found. Checked rows feed the weighted baseline share for this choice.`:'No matching past contests in the loaded files. Add a missing year below only if you have a past share from another source.'; const current=seatFunding(subject,key,fundMode); if(apply&&apply.dataset.touched!=='1'){if(current){apply.value=current.advantage.toFixed(4); apply.dataset.fromTracer='1';} else if(apply.dataset.fromTracer==='1'){apply.value=''; delete apply.dataset.fromTracer;}} if(note) note.textContent=fundNote(current);}
function fillBeta(form){const entry=selectedContest(form), key=form.choice?.value, line=form.querySelector('[data-file-line]'); if(!entry||!key){line.textContent=''; return;} const found=partyShare(entry.file,entry.race,key), sum=summarize(entry.file.records,entry.race); const grouped=new Map(); for(const c of sum.candidates){const id=c.party||c.name; grouped.set(id,(grouped.get(id)||0)+c.votes);} let other='', otherVotes=-1; for(const [id,votes] of grouped) if(id!==key&&votes>otherVotes){other=id; otherVotes=votes;} const otherNames=sum.candidates.filter(c=>(c.party||c.name)===other).map(c=>c.name).join(', '); line.textContent=found&&otherVotes>=0?`From the file: ${found.name} ${fmt(found.votes)} · ${otherNames} ${fmt(otherVotes)}`:'';}
function fillAllChoice(form){const entry=selectedContest(form), box=form.querySelector('.calc-rows'); if(!entry){box.innerHTML=''; return;} const previous=Object.fromEntries([...box.querySelectorAll('[name=prior]')].map(input=>[input.dataset.name,input.value])); box.innerHTML=summarize(entry.file.records,entry.race).candidates.map(c=>`<div class="calc-line" data-kind="choice"><span>${esc(c.name)}</span><b>${fmt(c.votes)}</b><label>Prior<input name="prior" data-name="${esc(c.name)}" data-votes="${c.votes}" type="number" min="0" step="0.1" value="${esc(previous[c.name]||'1')}"></label></div>`).join(''); const select=form.choice, keep=select.value; select.innerHTML=summarize(entry.file.records,entry.race).candidates.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join(''); if([...select.options].some(o=>o.value===keep)) select.value=keep;}
function fillPlaces(form){const entry=selectedContest(form), key=form.choice?.value, box=form.querySelector('.calc-places'); if(!entry||!key){box.innerHTML=''; return;} const counties=[...new Set(entry.file.records.filter(r=>r.race===entry.race).map(r=>r.county))].filter(Boolean).sort(); box.innerHTML=counties.map(county=>{const found=partyShare(entry.file,entry.race,key,county); return found?`<span data-place="${esc(county)}" data-value="${found.share}">${esc(county)} ${pct(found.share)}</span>`:''}).filter(Boolean).join(' · ');}
function sameSeat(a,b){return a!==b&&a.position&&a.position===b.position&&a.district&&a.district===b.district&&!(a.vintage&&b.vintage&&a.vintage!==b.vintage);}
function refreshCalc(form){const model=form.dataset.model; if(model==='historical-baseline') fillHistory(form); if(model==='remaining-vote-beta') fillBeta(form); if(model==='spatial') fillPlaces(form);}
function runCalc(form){try{
  const model=form.dataset.model, entry=selectedContest(form), key=form.choice?.value;
  if(!entry) return showCalc(form,{unavailable:true,reason:'Select a contest from the files.'});
  const contestId=`${entry.file.id}:${entry.race}`;
  if(model==='historical-baseline'){
    const histories=[], training=[];
    for(const line of form.querySelectorAll('.calc-line')){if(!line.querySelector('[name=use]')?.checked) continue; const share=line.dataset.kind==='file'?Number(line.querySelector('[data-share]').dataset.share):Number(line.querySelector('[name=share]').value); const weight=Number(line.querySelector('[name=weight]').value); if(!Number.isFinite(share)) continue; histories.push({share,weight:Number.isFinite(weight)&&weight>0?weight:1,compatible:true}); const fund=line.querySelector('[name=fund]').value.trim(); if(fund!==''&&Number.isFinite(Number(fund))) training.push({fundingAdvantage:Number(fund),outcomeShare:share});}
    const base=historicalBaseline({contestId,target:key,histories});
    if(base.unavailable) return showCalc(form,base);
    const lines=[['Contest',entry.race],['Choice',key],['Baseline',pct(base.estimate)],['Range',`${pct(base.interval[0])} – ${pct(base.interval[1])}`],['Contests',String(base.sampleSize)]];
    const fundMode=form.fundBaseline?.value==='category'?'category':'opponent';
    const influence=Math.max(0,(Number(form.fundInfluence?.value)||100)/100);
    lines.push(['Funding what-if',form.useFunding?.checked?`On · ${fundMode} · influence ${Math.round(influence*100)}%`:'Off (vote baseline only)']);
    const apply=form.applyFund.value.trim();
    if(form.useFunding?.checked){if(apply==='') lines.push(['Funding','Turned on, but no advantage number yet — import TRACER or type one.']); else {const fund=fundraisingAdjustedBaseline({contestId,target:key,baselineShare:base.estimate,fundingAdvantage:Number(apply),training,influence,assumedSlope:ASSUMED_FUNDING_SLOPE}); if(fund.unavailable) lines.push(['Funding',fund.reason]); else {const hit=seatFunding(entry,key,fundMode); lines.push(['Vote baseline',pct(base.estimate)],['Funding-adjusted',pct(fund.estimate)],['Slope',`${fund.inputs.slope.toFixed(4)} (${fund.inputs.slopeSource})`],['Funding note',fund.assumptions[0]],['Advantage used',Number(apply).toFixed(4)+(hit?` · TRACER focus ${moneyFmt(hit.focusReceipts)} vs ${fundCompareLabel(hit)}`:'')]);}}}
    return showCalc(form,base,lines);
  }
  if(model==='remaining-vote-beta'){
    if(form.remaining.value.trim()==='') return showCalc(form,{unavailable:true,reason:'Enter the remaining votes.'});
    const found=partyShare(entry.file,entry.race,key), sum=summarize(entry.file.records,entry.race), grouped=new Map();
    for(const c of sum.candidates){const id=c.party||c.name; grouped.set(id,(grouped.get(id)||0)+c.votes);} let otherVotes=-1; for(const [id,votes] of grouped) if(id!==key&&votes>otherVotes) otherVotes=votes;
    if(!found||otherVotes<0) return showCalc(form,{unavailable:true,reason:'That choice is not in the file.'});
    const record=remainingVoteBeta({contestId,target:key,alpha:Number(form.alpha.value),beta:Number(form.beta.value),observed:found.votes,paired:found.votes+otherVotes,remaining:Number(form.remaining.value)});
    return showCalc(form,record,record.unavailable?[]:[['Contest',entry.race],['Choice',key],['Share',pct(record.estimate)],['Range',`${pct(record.interval[0])} – ${pct(record.interval[1])}`],['Expected votes',fmt(Math.round(record.expectedFinal))],['From the file',fmt(found.votes)]]);
  }
  if(model==='dirichlet-multinomial'){
    if(form.remaining.value.trim()==='') return showCalc(form,{unavailable:true,reason:'Enter the remaining votes.'});
    const choices=[...form.querySelectorAll('[name=prior]')].map(input=>({name:input.dataset.name,votes:Number(input.dataset.votes),prior:Number(input.value)}));
    const record=allChoiceCount({contestId,target:form.choice.value,remaining:Number(form.remaining.value),choices});
    return showCalc(form,record,record.unavailable?[]:[['Contest',entry.race],['Choice',form.choice.value],['Share',pct(record.estimate)],['Range',`${pct(record.interval[0])} – ${pct(record.interval[1])}`],...record.choices.map(c=>[c.name,`${fmt(Math.round(c.expectedFinal))} · ${pct(c.finalShare)}`])]);
  }
  if(model==='kalman'){
    const series=form.series.value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const record=kalmanFilter({contestId,target:key||entry.race,series,processVariance:Number(form.q.value),observationVariance:Number(form.r.value),start:Number(form.start.value),startVariance:Number(form.p0.value)});
    return showCalc(form,record,record.unavailable?[]:[['Contest',entry.race],['Filtered',record.estimate.toFixed(4)],['Range',`${record.interval[0].toFixed(4)} – ${record.interval[1].toFixed(4)}`],['Observations',String(series.length)]]);
  }
  if(model==='markov-regime'){
    const startA=Number(form.start.value);
    const record=markovRegimes({contestId,target:form.a.value||'A',states:[form.a.value||'A',form.b.value||'B'],transitions:[[Number(form.aa.value),Number(form.ab.value)],[Number(form.ba.value),Number(form.bb.value)]],start:[startA,1-startA],steps:Number(form.steps.value)});
    return showCalc(form,record,record.unavailable?[]:[['Contest',entry.race],[record.states[0],pct(record.distribution[0])],[record.states[1],pct(record.distribution[1])],['Steps',String(record.steps)]]);
  }
  if(model==='spatial'){
    const places=[...form.querySelectorAll('[data-place]')].map(el=>({name:el.dataset.place,value:Number(el.dataset.value)}));
    const pairs=form.pairs.value.split(/\n/).map(line=>line.split(',')).filter(parts=>parts.length>=2).map(([a,b])=>[a.trim(),b.trim()]).filter(([a,b])=>a&&b);
    const record=spatialAssociation({contestId,target:key,places,pairs});
    return showCalc(form,record,record.unavailable?[]:[['Contest',entry.race],['Choice',key],["Moran's I",record.estimate.toFixed(3)],['Places',String(record.places)],['Pairs',String(record.pairs)]]);
  }
}catch(err){form.querySelector('.calc-out').textContent=err.message;}}
function mountCalculators(force=false){const files=calculatorFiles(), stamp=files.map(s=>s.id).join('|'); if(!force&&stamp===calcStamp&&$('models').querySelector('.calc')) return; calcStamp=stamp; calcContests=[]; for(const file of files){const list=Array.isArray(file.contests)&&file.contests.length?file.contests:[...new Set(file.records.map(r=>r.race))].map(race=>({race,position:'',districtLabel:''})); for(const c of list) if(file.records.some(r=>r.race===c.race)) calcContests.push({file,race:c.race,position:c.position||'',district:String(c.districtLabel||c.district||''),vintage:c.geographyVintage||'',election:file.election||file.label||file.id});} const options=`<option value="">Select a contest</option>`+calcContests.map((c,i)=>`<option value="${i}">${esc(c.election)} · ${esc(c.race)}</option>`).join('');
  const forms={
    'historical-baseline':`<form class="calc" data-model="historical-baseline"><label>Contest<select name="contest">${options}</select></label><label>Choice<select name="choice"></select></label><p class="calc-file wide" data-history-note>Compatible past contests from loaded files appear below. Check the ones to average into a baseline share for this choice. Add a missing year only when that election is not in the archives.</p><div class="calc-rows wide"></div><div class="wide"><button type="button" data-add="share">Add a year missing from the files</button></div><label class="check wide" title="Off keeps the vote-only baseline. On runs a separate what-if that nudges the baseline with funding advantage."><input type="checkbox" name="useFunding"> Include funding what-if</label><label>Funding baseline<select name="fundBaseline"><option value="opponent">Vs opponent</option><option value="category">Vs office-category average</option></select></label><label title="0 ignores funding. 100 uses the full historical or assumed slope.">Funding influence (%)<input name="fundInfluence" type="number" min="0" max="300" step="5" value="100"></label><label title="log₁₀(focus ÷ baseline). Positive means the focus side raised more. Used only when funding what-if is on.">Funding advantage to apply<input name="applyFund" type="number" step="any"></label><p class="calc-file wide" data-fund-note></p><div class="wide"><button type="submit">Run baseline</button></div><div class="calc-out wide"></div></form>`,
    'remaining-vote-beta':`<form class="calc" data-model="remaining-vote-beta"><label>Contest<select name="contest">${options}</select></label><label>Choice<select name="choice"></select></label><p class="calc-file wide" data-file-line></p><label>Prior α<input name="alpha" type="number" min="0" step="0.1" value="1"></label><label>Prior β<input name="beta" type="number" min="0" step="0.1" value="1"></label><label>Remaining votes<input name="remaining" type="number" min="0" step="1"></label><div class="wide"><button type="submit">Run</button></div><div class="calc-out wide"></div></form>`,
    'dirichlet-multinomial':`<form class="calc" data-model="dirichlet-multinomial"><label>Contest<select name="contest">${options}</select></label><label>Headline choice<select name="choice"></select></label><div class="calc-rows wide"></div><label>Remaining votes<input name="remaining" type="number" min="0" step="1"></label><div class="wide"><button type="submit">Run</button></div><div class="calc-out wide"></div></form>`,
    'kalman':`<form class="calc" data-model="kalman"><label>Contest<select name="contest">${options}</select></label><label class="wide">Series<input name="series" placeholder="0.48, 0.51, 0.49"></label><label>Process variance<input name="q" type="number" min="0" step="0.01" value="0.01"></label><label>Observation variance<input name="r" type="number" min="0" step="0.01" value="0.01"></label><label>Start<input name="start" type="number" step="any" value="0.5"></label><label>Start variance<input name="p0" type="number" min="0" step="0.01" value="1"></label><div class="wide"><button type="button" data-drops title="Loads Overview tracker predictions for this contest — not Experimental Analytics scenario drops.">Use Overview predictions</button> <button type="submit">Run</button></div><div class="calc-out wide"></div></form>`,
    'markov-regime':`<form class="calc" data-model="markov-regime"><label>Contest<select name="contest">${options}</select></label><label>State A<input name="a" value="Tight"></label><label>State B<input name="b" value="Wide"></label><label>A to A<input name="aa" type="number" min="0" max="1" step="0.01" value="0.8"></label><label>A to B<input name="ab" type="number" min="0" max="1" step="0.01" value="0.2"></label><label>B to A<input name="ba" type="number" min="0" max="1" step="0.01" value="0.3"></label><label>B to B<input name="bb" type="number" min="0" max="1" step="0.01" value="0.7"></label><label>Start P(A)<input name="start" type="number" min="0" max="1" step="0.01" value="1"></label><label>Steps<input name="steps" type="number" min="1" step="1" value="1"></label><div class="wide"><button type="submit">Run</button></div><div class="calc-out wide"></div></form>`,
    'spatial':`<form class="calc" data-model="spatial"><label>Contest<select name="contest">${options}</select></label><label>Choice<select name="choice"></select></label><p class="calc-places wide"></p><label class="wide">Neighbor pairs<textarea name="pairs" rows="4" placeholder="Adams, Jefferson"></textarea></label><div class="wide"><button type="submit">Run</button></div><div class="calc-out wide"></div></form>`
  };
  $('models').innerHTML=plannedPredictionCatalog.map(p=>`<details class="model-block"><summary><span><strong>${esc(p.label)}</strong><small>${esc(p.help||p.requirement)}</small></span></summary><p class="model-purpose">${esc(p.requirement)}</p>${forms[p.model]||''}</details>`).join('');
  document.querySelectorAll('#models form.calc').forEach(form=>{const idx=calcContests.findIndex(c=>c.file.id===currentElectionId); if(idx>=0) form.contest.value=String(idx); if(form.dataset.model==='dirichlet-multinomial') fillAllChoice(form); else fillChoices(form); refreshCalc(form);});
}
function predictionFiles(){return currentFirst(allSnapshots().filter(s=>s&&s.kind==='observed'&&!historicalFile(s)&&Array.isArray(s.records)&&s.records.length));}
let voteAutoOptions=[], researchHistory=[];
const researchModelKey='bullvixen.research.models.v1';
const defaultResearchModels=()=>Object.fromEntries(plannedPredictionCatalog.map((p,i)=>[p.model,i===0]));
let researchModelOn=(()=>{try{const raw=JSON.parse(localStorage.getItem(researchModelKey)||'null'); if(raw&&typeof raw==='object') return {...defaultResearchModels(),...raw};}catch{} return defaultResearchModels();})();
function persistResearchModels(){try{localStorage.setItem(researchModelKey,JSON.stringify(researchModelOn));}catch{}}

function voteAverageRows(){const rows=[]; for(const file of calculatorFiles()){const list=Array.isArray(file.contests)?file.contests:[]; for(const contest of list){const seat=contestSeat(file,contest); if(!seat||!file.records?.some(r=>r.race===contest.race)) continue; rows.push({...seat,total:summarize(file.records,contest.race).total});}} return rows;}
function researchState(){const pick=$('research-pick'), scenario=$('research-scenario'); if(!pick||!scenario) return null; const file=predictionFiles().find(s=>s.id===pick.file.value); if(!file||historicalFile(file)) return null; const contest=file.contests?.find(c=>c.race===pick.contest.value)||{race:pick.contest.value,position:'',districtLabel:pick.contest.value}; const sum=summarize(file.records,contest.race); const focusKey=pick.focus.value; const {focus,opponents,focusVotes,otherVotes}=focusAndOpponents(sum,focusKey); const selectedHistory=researchHistory.filter(row=>row.use); return {file,contest,sum,focus,opponents,focusVotes,otherVotes,selectedHistory,scenario};}
function fillResearchPick(force=false){const pick=$('research-pick'), drop=$('research-drop'), scenario=$('research-scenario'); if(!pick) return; const files=predictionFiles(), stamp=files.map(s=>s.id).join('|'); if(force||pick.dataset.stamp!==stamp){pick.dataset.stamp=stamp; const keep=pick.file.value; pick.file.innerHTML=files.map(s=>`<option value="${esc(s.id)}">${esc(s.election)}</option>`).join(''); if(files.some(s=>s.id===keep)) pick.file.value=keep; else if(files.some(s=>s.id===currentElectionId)) pick.file.value=currentElectionId;} const file=files.find(s=>s.id===pick.file.value); const races=file?[...new Set(file.records.map(r=>r.race))]:[]; const keepRace=pick.contest.value; pick.contest.innerHTML=races.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join(''); if(races.includes(keepRace)) pick.contest.value=keepRace; const sum=file&&pick.contest.value?summarize(file.records,pick.contest.value):{candidates:[]}; const keepFocus=pick.focus.value; const choices=[]; const seen=new Set(); for(const c of sum.candidates){const key=c.party||c.name; if(seen.has(key)) continue; seen.add(key); choices.push({key,label:c.party?`${c.party} · ${c.name}`:c.name});} pick.focus.innerHTML=choices.map(c=>`<option value="${esc(c.key)}">${esc(c.label)}</option>`).join(''); if(choices.some(c=>c.key===keepFocus)) pick.focus.value=keepFocus; const subjectKey=`${pick.file.value}|${pick.contest.value}|${pick.focus.value}`; if(pick.dataset.subject!==subjectKey){pick.dataset.subject=subjectKey; researchHistory=[]; if(scenario){scenario.finalTotal.value=''; scenario.remaining.value=''; scenario.auto.value=''; scenario.share.dataset.touched='';}} if(drop){drop.file.value=pick.file.value; drop.contest.value=pick.contest.value;} fillResearchHistory(); fillResearchAuto();}
function fillResearchHistory(){const pick=$('research-pick'), box=$('research-history'), note=$('research-history-note'); if(!box) return; const file=predictionFiles().find(s=>s.id===pick.file.value); const contest=file?.contests?.find(c=>c.race===pick.contest.value); const subject=file&&contest?contestSeat(file,contest):null; const focusKey=pick.focus.value; const previous=new Map(researchHistory.map(row=>[`${row.fileId}:${row.race}`,row.use])); const keepChecks=previous.size>0; researchHistory=[]; if(!subject){box.innerHTML='<p class="muted">This contest is not matched to a comparable office and district yet.</p>'; note.textContent='History needs a clear office and district.'; return;} for(const entry of calcContests){const seat=contestSeat(entry.file,{race:entry.race,position:entry.position,districtLabel:entry.district,geographyVintage:entry.vintage||undefined}); if(!seat||seat.fileId===subject.fileId) continue; if(seat.office!==subject.office||seat.district!==subject.district||seat.cycle!==subject.cycle) continue; if(seat.year>=subject.year) continue; const sum=summarize(entry.file.records,entry.race); if(!sum.total) continue; const found=focusKey?partyShare(entry.file,entry.race,focusKey):null; const key=`${seat.fileId}:${entry.race}`; const use=keepChecks&&previous.has(key)?previous.get(key):false; const fundMode=$('research-scenario')?.fundBaseline?.value==='category'?'category':'opponent'; const fundHit=found?seatFunding(entry,focusKey,fundMode):null; researchHistory.push({...seat,race:entry.race,total:sum.total,share:found?.share??null,fundingAdvantage:fundHit?.advantage??null,fundingMode:fundMode,use});} researchHistory.sort((a,b)=>b.year-a.year); if(!keepChecks) researchHistory.forEach((row,i)=>{row.use=i<2;}); box.innerHTML=researchHistory.length?researchHistory.map((row,i)=>`<label class="check history-item"><input type="checkbox" data-history="${i}" ${row.use?'checked':''}><span><b>${esc(String(row.year))} · ${esc(row.election)}</b><small>${fmt(row.total)} votes${row.share!=null?` · focus ${pct(row.share)}`:''}${row.fundingAdvantage!=null?` · fund ${row.fundingAdvantage.toFixed(2)}`:''}</small></span></label>`).join(''):'<p class="muted">No compatible past contests are in the loaded files.</p>'; note.textContent=researchHistory.length?'Same office and district on the current map. Check the ones to use.':'Same office and district only. Different map years stay out.';}
function fillResearchAuto(){const form=$('research-scenario'), label=form?.querySelector('.vote-auto'), note=$('vote-auto-note'); if(!form||!label) return; const pick=$('research-pick'); const file=predictionFiles().find(s=>s.id===pick.file.value); const contest=file?.contests?.find(c=>c.race===pick.contest.value); voteAutoOptions=file&&contest?pastVoteAverages(contestSeat(file,contest),voteAverageRows()):[]; const keep=form.auto.value; form.auto.innerHTML=voteAutoOptions.length?`<option value="">Write in</option>${voteAutoOptions.map(option=>`<option value="${option.n}">Past ${option.n} average · ${fmt(option.votes)}</option>`).join('')}`:''; if(voteAutoOptions.some(option=>String(option.n)===keep)) form.auto.value=keep; else form.auto.value=''; label.hidden=!voteAutoOptions.length; if(!form.auto.value){note.hidden=true; note.textContent='';}}
function applyResearchAuto(){const form=$('research-scenario'), note=$('vote-auto-note'), picked=voteAutoOptions.find(option=>String(option.n)===form.auto.value); if(!picked){note.hidden=true; note.textContent=''; return;} form.finalTotal.value=String(picked.votes); const state=researchState(); if(state) form.remaining.value=String(remainingFromFinal(state.focusVotes+state.otherVotes,picked.votes)??0); note.hidden=false; note.textContent=picked.rows.map(row=>`${row.year} ${fmt(row.total)}`).join(' · '); renderResearch();}
function svgLineChart(points, {yKey='y', bandLo, bandHi, zeroLine}={}){if(!points.length) return '<p class="muted">Nothing to chart yet.</p>'; const w=320,h=140,pad=18; const xs=points.map((_,i)=>i), ys=points.flatMap(p=>[p[yKey],bandLo?p[bandLo]:null,bandHi?p[bandHi]:null,zeroLine].filter(v=>v!=null)); const minY=Math.min(...ys), maxY=Math.max(...ys); const spanY=maxY-minY||1; const x=i=>pad+(i/(points.length-1||1))*(w-pad*2); const y=v=>h-pad-((v-minY)/spanY)*(h-pad*2); const line=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(p[yKey]).toFixed(1)}`).join(' '); const band=bandLo&&bandHi?`<path d="M${points.map((p,i)=>`${x(i).toFixed(1)} ${y(p[bandHi]).toFixed(1)}`).join(' L')} L${[...points].reverse().map((p,i)=>`${x(points.length-1-i).toFixed(1)} ${y(p[bandLo]).toFixed(1)}`).join(' L')} Z" fill="#0757a622"></path>`:''; const axis=zeroLine!=null&&zeroLine>=minY&&zeroLine<=maxY?`<line x1="${pad}" x2="${w-pad}" y1="${y(zeroLine)}" y2="${y(zeroLine)}" stroke="#9eb2c7" stroke-dasharray="4 4"></line>`:''; return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="presentation">${band}${axis}<path d="${line}" fill="none" stroke="#0757a6" stroke-width="2"></path>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p[yKey])}" r="3.5" fill="#172536"><title>${esc(p.label||'')}</title></circle>`).join('')}</svg>`;}
function svgCompareBars(rows){
  if(!rows.length) return '<p class="muted">Nothing to compare yet.</p>';
  const w=560,h=180,padL=118,padR=36,padT=16,padB=28;
  const max=Math.max(50,...rows.map(r=>r.pct),1);
  const barH=Math.min(22,(h-padT-padB)/rows.length-6);
  const yScale=v=>padL+((v/max)*(w-padL-padR));
  const marks=[0,25,50,75,100].filter(v=>v<=max+1e-9);
  return `<svg class="compare-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="presentation">
    ${marks.map(v=>`<line x1="${yScale(v).toFixed(1)}" x2="${yScale(v).toFixed(1)}" y1="${padT}" y2="${h-padB}" stroke="#d5e0eb"></line><text x="${yScale(v).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="10" fill="#6a7f95">${v}%</text>`).join('')}
    ${rows.map((row,i)=>{
      const y=padT+i*((h-padT-padB)/rows.length)+4;
      const width=Math.max(2,yScale(row.pct)-padL);
      return `<text x="${padL-8}" y="${(y+barH/2+4).toFixed(1)}" text-anchor="end" font-size="11" fill="#172536">${esc(row.label)}</text>
        <rect class="bar ${esc(row.tone)}" x="${padL}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${barH}" rx="3"><title>${esc(row.label)}: ${row.pct.toFixed(1)}%</title></rect>
        <text x="${(padL+width+6).toFixed(1)}" y="${(y+barH/2+4).toFixed(1)}" font-size="11" fill="#172536">${row.pct.toFixed(1)}%</text>`;
    }).join('')}
  </svg>`;
}

function renderResearch(){const state=researchState(), drop=$('research-drop'); if(!state){['research-count','research-path-summary','research-path-metrics','research-turnout','research-cases','chart-compare','chart-compare-text','chart-compare-legend','chart-baseline','chart-baseline-text','chart-fan','chart-fan-text','chart-stack','chart-stack-text','chart-drops','chart-drops-text','research-model-viz'].forEach(id=>{if($(id)) $(id).innerHTML=id==='research-path-summary'?'Open a current election file to begin.':'';}); if($('research-drops')) $('research-drops').innerHTML=''; if($('research-drop-actions')) $('research-drop-actions').hidden=true; if($('research-funding-note')){$('research-funding-note').hidden=true; $('research-funding-note').textContent='';} if($('research-model-viz')) $('research-model-viz').innerHTML=''; if($('research-model-empty')) $('research-model-empty').hidden=false; return;} const {file,contest,sum,focus,opponents,focusVotes,otherVotes,selectedHistory,scenario}=state; const reported=focusVotes+otherVotes; const asOf=file.asOf||file.electionDate||null; $('research-count').innerHTML=`<p><strong>${esc(contest.race)}</strong></p><p>${esc(file.election)}${contest.position?` · ${esc(contest.position)}`:''}${contest.districtLabel?` · ${esc(contest.districtLabel)}`:''}</p><p>${focus?`${esc(focus.name)} ${fmt(focusVotes)}`:'No focus choice'}${opponentLines(opponents)}</p><p>${fmt(sum.total)} votes in the file${asOf?` · reported ${esc(time(asOf))}`:''}</p>`; $('research-reported').textContent=`Reported in this calculator: ${fmt(reported)} focus+opponent votes from the file. Estimated final and remaining are scenario knobs only.`; if(scenario.finalTotal.value===''&&selectedHistory.length){const turnout=turnoutScenarios(selectedHistory.map(row=>row.total)); if(turnout.ok){scenario.finalTotal.value=String(turnout.average); scenario.remaining.value=String(remainingFromFinal(reported,turnout.average)??0);}} const shares=selectedHistory.filter(row=>row.share!=null).map(row=>({share:row.share,weight:1,compatible:true,year:row.year,total:row.total,label:`${row.year}`})); const voteBase=shares.length?historicalBaseline({contestId:`${file.id}:${contest.race}`,target:pickFocusLabel(focus),histories:shares}):null; const voteBaseline=voteBase&&!voteBase.unavailable?voteBase.estimate:null; if(shares.length&&scenario.share.dataset.touched!=='1'&&scenario.useFunding?.dataset.fundingSet!=='1'){if(voteBaseline!=null) scenario.share.value=(voteBaseline*100).toFixed(1);} const fundNoteEl=$('research-funding-note'); let focusShare=Number(scenario.share.value)/100; if(scenario.useFunding?.checked){const fundMode=scenario.fundBaseline?.value==='category'?'category':'opponent'; const influence=Math.max(0,(Number(scenario.fundInfluence?.value)||100)/100); const fundingMeta=researchFundingWhatIf({file,contest,focus,selectedHistory,voteBaseline,mode:fundMode,influence}); if(fundingMeta.ok){if(scenario.share.dataset.touched!=='1'){scenario.share.value=(fundingMeta.estimate*100).toFixed(1); scenario.useFunding.dataset.fundingSet='1'; focusShare=fundingMeta.estimate;} if(fundNoteEl){fundNoteEl.hidden=false; fundNoteEl.textContent=scenario.share.dataset.touched==='1'?`Funding what-if ready (vote ${pct(fundingMeta.voteBaseline)} → ${pct(fundingMeta.estimate)}), but your typed share ${pct(focusShare)} is in use. ${fundingMeta.conclusion}`:`Funding what-if on: vote baseline ${pct(fundingMeta.voteBaseline)} → adjusted ${pct(fundingMeta.estimate)} (advantage ${fundingMeta.hit.advantage.toFixed(3)} · TRACER focus ${moneyFmt(fundingMeta.hit.focusReceipts)} vs ${fundCompareLabel(fundingMeta.hit)}). ${fundingMeta.conclusion}`;}} else if(fundNoteEl){fundNoteEl.hidden=false; fundNoteEl.textContent=`Funding what-if on, but not applied: ${fundingMeta.reason}`;}} else {if(scenario.useFunding) delete scenario.useFunding.dataset.fundingSet; if(fundNoteEl){fundNoteEl.hidden=true; fundNoteEl.textContent='';}} const estimatedFinal=scenario.finalTotal.value.trim()===''?null:Number(scenario.finalTotal.value); const remaining=scenario.remaining.value.trim()===''?(estimatedFinal==null?null:remainingFromFinal(reported,estimatedFinal)):Number(scenario.remaining.value); if(estimatedFinal!=null&&Number.isSafeInteger(estimatedFinal)&&scenario.remaining.value.trim()===''&&remaining!=null) scenario.remaining.value=String(remaining); const path=remaining==null||!Number.isSafeInteger(remaining)?null:pathToVictory({focusVotes,otherVotes,remaining}); $('research-kind').textContent=path?'SCENARIO':'WAITING'; $('research-path-summary').textContent=path?path.summary:'Enter an estimated final vote total or the votes remaining.'; $('research-path-metrics').innerHTML=path?[['Votes needed to lead',path.votesNeeded==null?'Not reachable':fmt(path.votesNeeded),'How many of the remaining votes the focus choice still needs to finish ahead.'],['Required share of remaining',path.requiredShare==null?'—':pct(path.requiredShare),'Share of still-uncounted votes the focus choice would need to take the lead.'],['Current margin',`${path.currentMarginPp.toFixed(2)} pp`,tipPp],['Current share',pct(path.currentShare),'Focus votes divided by all reported votes so far.'],['Votes remaining',fmt(path.remaining),'Votes not yet in the file for this scenario knob.'],['Reported so far',fmt(path.reported),'Focus plus opponent votes already reported.']].map(([k,v,t])=>`<div title="${esc(t)}"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join(''):''; const turnout=turnoutScenarios(selectedHistory.map(row=>row.total)); $('research-turnout').innerHTML=turnout.ok?turnout.rows.map(row=>{const rem=remainingFromFinal(reported,row.finalTotal); const board=rem==null||!(focusShare>=0&&focusShare<=1)?null:scenarioBoard({focusVotes,otherVotes,estimatedFinal:row.finalTotal,focusShare}); const base=board?.cases.find(c=>c.id==='base'); return `<button type="button" class="scenario-card" data-final="${row.finalTotal}"><span>${esc(row.label)}</span><strong>${fmt(row.finalTotal)}</strong><small>${rem==null?'':`${fmt(rem)} left`}${base?` · ${base.winner==='focus'?'Ahead':base.winner==='other'?'Behind':'Tied'} ${base.marginPp.toFixed(1)} pp`:''}</small></button>`;}).join(''):`<p class="muted">${esc(turnout.reason||'Select history to seed turnout.')}</p>`; const board=estimatedFinal!=null&&Number.isSafeInteger(estimatedFinal)&&focusShare>=0&&focusShare<=1?scenarioBoard({focusVotes,otherVotes,estimatedFinal,focusShare}):null; $('research-cases').innerHTML=board?.ok?board.cases.map(c=>`<article class="scenario-card ${c.id}" title="${esc(tipPp)}"><span>${esc(c.label)}</span><strong>${c.winner==='focus'?'Ahead':c.winner==='other'?'Behind':'Tied'}</strong><small title="${esc(tipPp)}">${c.marginPp>=0?'+':''}${c.marginPp.toFixed(2)} pp · focus share ${(c.share*100).toFixed(1)}%</small></article>`).join('')+'<p class="chart-text">'+esc(board.assumptions.join(' · '))+'</p>':''; const reportedShare=reported?focusVotes/reported:null;
  const fundModeAlways=scenario.fundBaseline?.value==='category'?'category':'opponent';
  const influenceAlways=Math.max(0,(Number(scenario.fundInfluence?.value)||100)/100);
  const fundingPreview=researchFundingWhatIf({file,contest,focus,selectedHistory,voteBaseline,mode:fundModeAlways,influence:influenceAlways});
  const baseCase=board?.ok?board.cases.find(c=>c.id==='base'):null;
  const bestCase=board?.ok?board.cases.find(c=>c.id==='best'):null;
  const worstCase=board?.ok?board.cases.find(c=>c.id==='worst'):null;
  const modelResults=evaluateResearchModels({file,contest,focus,focusVotes,otherVotes,selectedHistory,remaining:Number.isSafeInteger(remaining)?remaining:null,voteBaseline});
  renderResearchModelViz(modelResults);
  const modelExtra=modelResults.filter(r=>r.chart&&!r.record.unavailable).map(r=>({id:r.meta.model,label:r.chartLabel||r.meta.label,value:r.record.estimate,tone:'model'}));
  // Avoid duplicating the always-on vote-history bar when historical baseline is toggled.
  const compareExtra=modelExtra.filter(r=>r.id!=='historical-baseline'||voteBaseline==null);
  const showVoteBar=!researchModelOn['historical-baseline']?null:voteBaseline;
  const compare=projectionCompare({
    reportedShare,
    voteBaseline:showVoteBar,
    fundingShare:fundingPreview.ok?fundingPreview.estimate:null,
    scenarioShare:baseCase?.share??null,
    bestShare:bestCase?.share??null,
    worstShare:worstCase?.share??null,
    extra:compareExtra
  });
  if($('chart-compare')) $('chart-compare').innerHTML=compare.ok?svgCompareBars(compare.rows):'<p class="muted">Check history or enter a scenario to compare projections.</p>';
  if($('chart-compare-text')){
    if(!compare.ok) $('chart-compare-text').textContent='';
    else {
      const bits=[];
      if(reportedShare!=null) bits.push(`reported ${pct(reportedShare)}`);
      if(voteBaseline!=null) bits.push(`vote history ${pct(voteBaseline)}`);
      if(fundingPreview.ok) bits.push(`funding ${pct(fundingPreview.estimate)} (${fundModeAlways}, influence ${Math.round(influenceAlways*100)}%)`);
      else if(scenario.useFunding?.checked) bits.push(`funding unavailable: ${fundingPreview.reason}`);
      if(baseCase) bits.push(`scenario ${pct(baseCase.share)}`);
      $('chart-compare-text').textContent=bits.join(' · ');
    }
  }
  if($('chart-compare-legend')) $('chart-compare-legend').innerHTML=compare.ok?compare.rows.map(r=>`<span><i class="${esc(r.tone)}"></i>${esc(r.label)}</span>`).join(''):'';
  const baselinePoints=shares.map(row=>({y:row.share*100,label:`${row.year}: ${(row.share*100).toFixed(1)}%`})); if(baselinePoints.length){const base=historicalBaseline({contestId:`${file.id}:${contest.race}`,target:pickFocusLabel(focus),histories:shares}); const estimate=base.unavailable?null:base.estimate*100; const band=base.unavailable?null:base.interval.map(v=>v*100); $('chart-baseline').innerHTML=svgLineChart(baselinePoints.map((p,i)=>({...p,mid:estimate,lo:band?band[0]:null,hi:band?band[1]:null})),{yKey:'y'}); $('chart-baseline-text').textContent=base.unavailable?base.reason:`Baseline ${estimate.toFixed(1)}% from ${base.sampleSize} checked contest${base.sampleSize===1?'':'s'}. Band ${band[0].toFixed(1)}%–${band[1].toFixed(1)}%.`;} else {$('chart-baseline').innerHTML='<p class="muted">Check past contests to draw the baseline.</p>'; $('chart-baseline-text').textContent='';} const maxRemaining=Math.max(remaining||0,...(turnout.ok?turnout.rows.map(row=>remainingFromFinal(reported,row.finalTotal)||0):[0]),1); const fan=fanPoints({focusVotes,otherVotes,maxRemaining,focusShare:Number.isFinite(focusShare)?focusShare:0.5,steps:10}).map(p=>({y:p.marginPp,lo:p.worstMarginPp,hi:p.bestMarginPp,label:`${fmt(p.remaining)} left · ${p.marginPp.toFixed(1)} pp`})); $('chart-fan').innerHTML=fan.length?svgLineChart(fan,{yKey:'y',bandLo:'lo',bandHi:'hi',zeroLine:0}):'<p class="muted">Enter remaining votes to draw the fan.</p>'; $('chart-fan-text').textContent=path?.requiredShare!=null?`Win line for this choice: about ${pct(path.requiredShare)} of the votes still out.`:(fan.length?'Solid line is the base remaining share. Band is ±10 points.':''); const stackRemaining=remaining||0; const focusRemain=stackRemaining*(Number.isFinite(focusShare)?focusShare:0.5); const otherRemain=stackRemaining-focusRemain; $('chart-stack').innerHTML=`<div class="stack-chart"><div><span>${esc(focus?.name||'Focus')}</span><div class="stack-bar"><i class="reported" style="flex:${Math.max(focusVotes,0.0001)}"></i><i class="remain" style="flex:${Math.max(focusRemain,0.0001)}"></i></div><b>${fmt(Math.round(focusVotes+focusRemain))}</b></div><div><span>${opponents.length<=1?'Opponent':opponents.map((c,i)=>`Opponent ${i+1}`).join(' · ')}</span><div class="stack-bar"><i class="reported other" style="flex:${Math.max(otherVotes,0.0001)}"></i><i class="remain other" style="flex:${Math.max(otherRemain,0.0001)}"></i></div><b>${fmt(Math.round(otherVotes+otherRemain))}</b></div></div>`; $('chart-stack-text').textContent=`Solid segment: reported. Hatched segment: expected remaining under the base share.`; const drops=researchDropsFor(file.id,contest.race); const maxDrop=Math.max(...drops.map(d=>d.votes),1); $('chart-drops').innerHTML=drops.length?`<div class="drop-bars">${drops.map((d,i)=>`<div><i style="height:${(d.votes/maxDrop*100).toFixed(1)}%"></i><small>${i+1}</small></div>`).join('')}</div>`:'<p class="muted">No scenario drops for this contest yet.</p>'; $('chart-drops-text').textContent=drops.length?`Each bar is a scenario drop on this page only — not an Overview prediction.`:''; $('research-drops').innerHTML=drops.slice().reverse().map(p=>`<div class="drop-row"><span>${fmt(p.votes)} · ${esc(p.provenance)}${p.asOf?` · ${esc(time(p.asOf))}`:''}</span><button type="button" data-drop-remove="${esc(p.id)}">Remove</button></div>`).join(''); const actions=$('research-drop-actions'); if(actions) actions.hidden=!drops.length;}
function pickFocusLabel(focus){return focus?(focus.party||focus.name):'focus';}
function researchFundingWhatIf({file,contest,focus,selectedHistory,voteBaseline,mode='opponent',influence=1}){
  const training=selectedHistory.filter(row=>row.share!=null&&Number.isFinite(row.fundingAdvantage)).map(row=>({fundingAdvantage:row.fundingAdvantage,outcomeShare:row.share}));
  const entry={file,race:contest.race,position:contest.position||'',district:String(contest.districtLabel||contest.district||'')};
  const hit=seatFunding(entry,pickFocusLabel(focus),mode);
  if(!hit) return {ok:false,reason:mode==='category'?'Import TRACER data with matching focus receipts and other candidates in this office category.':'Import a TRACER file with matching candidate receipts to run a funding what-if.'};
  if(!Number.isFinite(voteBaseline)) return {ok:false,reason:'Check past contests first so there is a vote baseline to adjust.',hit,training};
  const adjusted=fundraisingAdjustedBaseline({contestId:`${file.id}:${contest.race}`,target:pickFocusLabel(focus),baselineShare:voteBaseline,fundingAdvantage:hit.advantage,training,influence,assumedSlope:ASSUMED_FUNDING_SLOPE});
  if(adjusted.unavailable) return {ok:false,reason:adjusted.reason,hit,training};
  const slopeNote=adjusted.inputs.slopeSource==='historical'?`historical slope ${adjusted.inputs.slope.toFixed(4)} from ${training.length} contests`:`assumed slope ${adjusted.inputs.slope} (more money → higher share; only ${training.length} funded history row${training.length===1?'':'s'})`;
  return {ok:true,hit,training,voteBaseline,estimate:adjusted.estimate,influence,mode,conclusion:`${slopeNote}. Influence ${Math.round(influence*100)}%.`};
}

function mountResearchModels(){
  const box=$('research-models'); if(!box) return;
  box.innerHTML=plannedPredictionCatalog.map(p=>`<label class="model-toggle"><input type="checkbox" data-model="${esc(p.model)}" ${researchModelOn[p.model]?'checked':''}><span><strong>${esc(p.label)}</strong><small>${esc(p.help||p.requirement)}</small></span></label>`).join('');
}

function modelCardShell(meta, badge, body, note){
  return `<article class="model-card"><header><strong>${esc(meta.label)}</strong><span class="badge">${esc(badge)}</span></header>${body}${note?`<p class="model-note">${note}</p>`:''}</article>`;
}
function svgHistoryBaseline(points, estimate, interval){
  if(!points.length) return '';
  const w=320,h=110,pad=22;
  const xs=points.map((_,i)=>i);
  const ys=[...points.map(p=>p.share*100), estimate*100, ...(interval||[]).map(v=>v*100)];
  const minY=Math.min(...ys,0), maxY=Math.max(...ys,100);
  const span=maxY-minY||1;
  const x=i=>pad+(i/(points.length-1||1))*(w-pad*2);
  const y=v=>h-pad-((v-minY)/span)*(h-pad*2);
  const line=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(p.share*100).toFixed(1)}`).join(' ');
  const band=interval?`<rect x="${pad}" y="${y(interval[1]*100).toFixed(1)}" width="${w-pad*2}" height="${Math.max(2,y(interval[0]*100)-y(interval[1]*100)).toFixed(1)}" fill="#7a4fb022"></rect><line x1="${pad}" x2="${w-pad}" y1="${y(estimate*100).toFixed(1)}" y2="${y(estimate*100).toFixed(1)}" stroke="#7a4fb0" stroke-dasharray="4 3"></line>`:'';
  return `<svg class="model-viz" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Past shares and baseline"><title>Past focus shares with baseline</title>${band}<path d="${line}" fill="none" stroke="#0757a6" stroke-width="2"></path>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.share*100)}" r="3.5" fill="#172536"><title>${esc(String(p.year))}: ${(p.share*100).toFixed(1)}%</title></circle>`).join('')}</svg>`;
}
function svgIntervalBar(lo, mid, hi, label){
  const w=320,h=54,pad=16;
  const x=v=>pad+Math.max(0,Math.min(1,v))*(w-pad*2);
  return `<svg class="model-viz" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
    <line x1="${pad}" x2="${w-pad}" y1="28" y2="28" stroke="#d5e0eb" stroke-width="6" stroke-linecap="round"></line>
    <line x1="${x(lo).toFixed(1)}" x2="${x(hi).toFixed(1)}" y1="28" y2="28" stroke="#7a4fb0" stroke-width="6" stroke-linecap="round"></line>
    <circle cx="${x(mid).toFixed(1)}" cy="28" r="6" fill="#172536"></circle>
    <text x="${x(lo).toFixed(1)}" y="48" text-anchor="middle" font-size="10" fill="#536579">${(lo*100).toFixed(1)}%</text>
    <text x="${x(mid).toFixed(1)}" y="14" text-anchor="middle" font-size="11" fill="#172536">${(mid*100).toFixed(1)}%</text>
    <text x="${x(hi).toFixed(1)}" y="48" text-anchor="middle" font-size="10" fill="#536579">${(hi*100).toFixed(1)}%</text>
  </svg>`;
}
function svgChoiceBars(rows, focusName){
  if(!rows?.length) return '';
  const max=Math.max(...rows.map(r=>r.finalShare),0.01);
  return `<div class="model-bars">${rows.slice(0,8).map(r=>{
    const hot=r.name===focusName?' focus':'';
    return `<div class="${hot.trim()}"><span title="${esc(r.name)}">${esc(r.name.length>18?r.name.slice(0,16)+'…':r.name)}</span><div><i style="width:${(r.finalShare/max*100).toFixed(1)}%"></i></div><b>${pct(r.finalShare)}</b></div>`;
  }).join('')}</div>`;
}
function svgKalman(obs, filtered, interval){
  if(!obs?.length||!filtered?.length) return '';
  const w=320,h=110,pad=22;
  const ys=[...obs,...filtered,...(interval||[])].map(v=>v*100);
  const minY=Math.min(...ys,0), maxY=Math.max(...ys,100), span=maxY-minY||1;
  const x=i=>pad+(i/(obs.length-1||1))*(w-pad*2);
  const y=v=>h-pad-((v*100-minY)/span)*(h-pad*2);
  const obsPath=obs.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const filPath=filtered.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last=filtered[filtered.length-1];
  const band=interval?`<line x1="${x(filtered.length-1)}" x2="${x(filtered.length-1)}" y1="${y(interval[0]).toFixed(1)}" y2="${y(interval[1]).toFixed(1)}" stroke="#7a4fb088" stroke-width="4"></line>`:'';
  return `<svg class="model-viz" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Kalman filter"><title>Observations vs filtered path</title>
    <path d="${obsPath}" fill="none" stroke="#9eb2c7" stroke-width="2" stroke-dasharray="3 3"></path>
    <path d="${filPath}" fill="none" stroke="#7a4fb0" stroke-width="2.5"></path>
    ${band}<circle cx="${x(filtered.length-1)}" cy="${y(last)}" r="4" fill="#172536"></circle>
  </svg><p class="model-legend"><span><i class="obs"></i>Observed</span><span><i class="fil"></i>Filtered</span></p>`;
}
function svgRegimeSteps(steps){
  if(!steps?.length) return '';
  const w=320,h=90,pad=18,bw=(w-pad*2)/steps.length-4;
  return `<svg class="model-viz" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Regime path">
    ${steps.map((row,i)=>{
      const x=pad+i*((w-pad*2)/steps.length);
      const tight=row[0]* (h-pad*2);
      return `<g><rect x="${x.toFixed(1)}" y="${pad}" width="${bw.toFixed(1)}" height="${(h-pad*2).toFixed(1)}" fill="#e8eef4" rx="3"></rect>
        <rect x="${x.toFixed(1)}" y="${(pad+(h-pad*2)-tight).toFixed(1)}" width="${bw.toFixed(1)}" height="${tight.toFixed(1)}" fill="#7a4fb0" rx="3"><title>Step ${i+1}: Tight ${(row[0]*100).toFixed(1)}%</title></rect>
        <text x="${(x+bw/2).toFixed(1)}" y="${h-4}" text-anchor="middle" font-size="10" fill="#536579">${i+1}</text></g>`;
    }).join('')}
  </svg><p class="model-legend"><span><i class="fil"></i>P(Tight)</span></p>`;
}
function svgSpatialRanks(places){
  if(!places?.length) return '';
  const sorted=[...places].sort((a,b)=>b.value-a.value).slice(0,10);
  const max=Math.max(...sorted.map(p=>p.value),0.01);
  return `<div class="model-bars spatial">${sorted.map(p=>`<div><span title="${esc(p.name)}">${esc(p.name.length>14?p.name.slice(0,12)+'…':p.name)}</span><div><i style="width:${(p.value/max*100).toFixed(1)}%;opacity:${(0.35+0.65*p.value/max).toFixed(2)}"></i></div><b>${pct(p.value)}</b></div>`).join('')}</div>`;
}
function svgVoteSplit(observed, expectedRemain, expectedFinal){
  const parts=[{label:'Reported',value:observed,cls:'obs'},{label:'Expected from remaining',value:expectedRemain,cls:'fil'},{label:'Expected final',value:expectedFinal,cls:'mid'}];
  const max=Math.max(...parts.map(p=>p.value),1);
  return `<div class="model-bars">${parts.map(p=>`<div><span>${esc(p.label)}</span><div><i class="${p.cls}" style="width:${(p.value/max*100).toFixed(1)}%"></i></div><b>${fmt(Math.round(p.value))}</b></div>`).join('')}</div>`;
}
function evaluateResearchModels({file,contest,focus,focusVotes,otherVotes,selectedHistory,remaining,voteBaseline}){
  const contestId=`${file.id}:${contest.race}`;
  const target=pickFocusLabel(focus);
  const out=[];
  const enabled=plannedPredictionCatalog.filter(p=>researchModelOn[p.model]);
  for(const meta of enabled){
    const model=meta.model;
    try{
      if(model==='historical-baseline'){
        const historyPoints=[...selectedHistory].filter(r=>r.share!=null).sort((a,b)=>a.year-b.year).map(r=>({year:r.year,share:r.share}));
        const histories=historyPoints.map(r=>({share:r.share,weight:1,compatible:true}));
        const record=historicalBaseline({contestId,target,histories});
        out.push({meta,record,chart:!record.unavailable&&Number.isFinite(record.estimate), chartLabel:'Hist. baseline', viz:'historical', historyPoints});
      } else if(model==='remaining-vote-beta'){
        if(remaining==null||!Number.isSafeInteger(remaining)){ out.push({meta,record:{unavailable:true,reason:'Enter votes remaining in the scenario knobs.'},chart:false}); continue; }
        const record=remainingVoteBeta({contestId,target,alpha:1,beta:1,observed:focusVotes,paired:focusVotes+otherVotes,remaining});
        out.push({meta,record,chart:!record.unavailable, chartLabel:'Remain. beta', viz:'beta'});
      } else if(model==='dirichlet-multinomial'){
        if(remaining==null||!Number.isSafeInteger(remaining)){ out.push({meta,record:{unavailable:true,reason:'Enter votes remaining in the scenario knobs.'},chart:false}); continue; }
        const sum=summarize(file.records,contest.race);
        const choices=sum.candidates.map(c=>({name:c.name,votes:c.votes,prior:1}));
        const record=allChoiceCount({contestId,target:focus?.name||target,remaining,choices});
        out.push({meta,record,chart:!record.unavailable, chartLabel:'All-choice', viz:'dirichlet', focusName:focus?.name||target});
      } else if(model==='kalman'){
        const labeled=[...selectedHistory].filter(r=>r.share!=null).sort((a,b)=>a.year-b.year).map(r=>({label:String(r.year),share:r.share}));
        const reported=focusVotes+otherVotes;
        if(reported) labeled.push({label:'Now',share:focusVotes/reported});
        const series=labeled.map(r=>r.share);
        if(series.length<2){ out.push({meta,record:{unavailable:true,reason:'Need at least two share points from checked history and/or reported votes.'},chart:false}); continue; }
        const record=kalmanFilter({contestId,target,series,processVariance:0.01,observationVariance:0.01,start:series[0],startVariance:1});
        out.push({meta,record,chart:!record.unavailable&&record.estimate>=0&&record.estimate<=1, chartLabel:'Kalman', viz:'kalman', series, labels:labeled.map(r=>r.label)});
      } else if(model==='markov-regime'){
        const reported=focusVotes+otherVotes;
        const marginPp=reported?((focusVotes-otherVotes)/reported)*100:0;
        const startTight=Math.max(0,Math.min(1,1-Math.abs(marginPp)/10));
        const start=[startTight,1-startTight];
        const transitions=[[0.8,0.2],[0.3,0.7]];
        const steps=[];
        for(let n=1;n<=5;n++){
          const step=markovRegimes({contestId,target,states:['Tight','Wide'],transitions,start,steps:n});
          if(!step.unavailable) steps.push(step.distribution);
        }
        const record=markovRegimes({contestId,target,states:['Tight','Wide'],transitions,start,steps:1});
        out.push({meta,record,chart:false, viz:'regime', regimeSteps:steps, marginPp, startTight});
      } else if(model==='spatial'){
        const counties=[...new Set(file.records.filter(r=>r.race===contest.race).map(r=>r.county))].filter(Boolean).sort();
        const places=counties.map(county=>{const found=partyShare(file,contest.race,target,county); return found?{name:county,value:found.share}:null;}).filter(Boolean);
        const pairs=[];
        for(let i=0;i<places.length-1;i++) pairs.push([places[i].name,places[i+1].name]);
        if(places.length<3||!pairs.length){ out.push({meta,record:{unavailable:true,reason:'Need focus shares in at least three counties to sketch neighbors.'},chart:false}); continue; }
        const record=spatialAssociation({contestId,target,places,pairs});
        out.push({meta,record,chart:false, viz:'spatial', places, note:'Neighbor pairs are alphabetical adjacent counties — a sketch, not a real map.'});
      }
    }catch(err){ out.push({meta,record:{unavailable:true,reason:err.message},chart:false}); }
  }
  return out;
}
function renderResearchModelViz(results){
  const box=$('research-model-viz'), empty=$('research-model-empty');
  if(!box) return;
  if(!results.length){ box.innerHTML=''; if(empty) empty.hidden=false; return; }
  if(empty) empty.hidden=true;
  box.innerHTML=results.map(item=>{
    const {meta,record,viz}=item;
    if(record.unavailable) return modelCardShell(meta,'N/A','',esc(record.reason||'Unavailable for this contest.'));
    if(viz==='historical'){
      const body=`<div class="model-stat">${pct(record.estimate)}</div>${svgHistoryBaseline(item.historyPoints||[], record.estimate, record.interval)}`;
      return modelCardShell(meta,'SHARE',body,`Baseline from ${record.sampleSize} checked contest${record.sampleSize===1?'':'s'}${record.interval?` · band ${pct(record.interval[0])}–${pct(record.interval[1])}`:''}.`);
    }
    if(viz==='beta'){
      const body=`<div class="model-stat">${pct(record.estimate)}</div>${svgIntervalBar(record.interval[0],record.estimate,record.interval[1],'Beta interval')}${svgVoteSplit(record.observed,record.expectedRemaining,record.expectedFinal)}`;
      return modelCardShell(meta,'BETA',body,`Posterior share with flat prior · ${fmt(record.remaining)} remaining votes.`);
    }
    if(viz==='dirichlet'){
      const body=`<div class="model-stat">${pct(record.estimate)}</div>${svgChoiceBars(record.choices,item.focusName)}${record.interval?svgIntervalBar(record.interval[0],record.estimate,record.interval[1],'Focus interval'):''}`;
      return modelCardShell(meta,'ALL',body,'Expected final shares for every choice in the file after allocating remaining votes.');
    }
    if(viz==='kalman'){
      const body=`<div class="model-stat">${pct(record.estimate)}</div>${svgKalman(item.series,record.filtered,record.interval)}`;
      return modelCardShell(meta,'FILTER',body,'Smoothed path through history shares and current reported share.');
    }
    if(viz==='regime'){
      const bars=record.states.map((name,i)=>`<div><span>${esc(name)}</span><div><i style="width:${(record.distribution[i]*100).toFixed(1)}%"></i></div><b>${pct(record.distribution[i])}</b></div>`).join('');
      const body=`<div class="model-bars">${bars}</div>${svgRegimeSteps(item.regimeSteps||[])}`;
      return modelCardShell(meta,'REGIME',body,`Start P(Tight)=${pct(item.startTight)} from margin ${item.marginPp>=0?'+':''}${item.marginPp.toFixed(1)} pp · five forward steps.`);
    }
    if(viz==='spatial'){
      const body=`<div class="model-stat">I = ${record.estimate.toFixed(3)}</div>${svgSpatialRanks(item.places||[])}`;
      return modelCardShell(meta,'SPATIAL',body,`Moran's I · ${record.places} places · ${record.pairs} pairs. ${esc(item.note||'')}`);
    }
    return modelCardShell(meta,'SHARE',`<div class="model-stat">${pct(record.estimate)}</div>`, 'Estimate for this contest.');
  }).join('');
}
function mountResearch(){fillResearchPick(); mountResearchModels(); renderResearch();}
const pad={display:'0',acc:null,op:null,fresh:true};
function padShow(){const el=$('pad-display'); if(el) el.textContent=pad.display;}
function padNum(){const n=Number(pad.display); return Number.isFinite(n)?n:0;}
function padApply(){if(pad.acc==null||!pad.op) return padNum(); const a=pad.acc,b=padNum(); let out=0; if(pad.op==='+') out=a+b; else if(pad.op==='-') out=a-b; else if(pad.op==='*') out=a*b; else if(pad.op==='/') out=b===0?NaN:a/b; if(!Number.isFinite(out)){pad.display='Error'; pad.acc=null; pad.op=null; pad.fresh=true; return NaN;} const text=String(Number(out.toPrecision(12))); pad.display=text; pad.acc=null; pad.op=null; pad.fresh=true; return Number(text);}
$('pad-calc')?.addEventListener('click',e=>{const btn=e.target.closest('[data-pad]'); if(!btn) return; const kind=btn.dataset.pad; if(kind==='clear'){pad.display='0'; pad.acc=null; pad.op=null; pad.fresh=true;} else if(kind==='back'){if(pad.fresh) return; pad.display=pad.display.length>1?pad.display.slice(0,-1):'0'; if(pad.display==='-'||pad.display==='-0') pad.display='0';} else if(kind==='digit'){const d=btn.textContent.trim(); if(pad.fresh||pad.display==='0'||pad.display==='Error'){pad.display=d; pad.fresh=false;} else if(pad.display.replace('-','').replace('.','').length<14) pad.display+=d;} else if(kind==='dot'){if(pad.fresh||pad.display==='Error'){pad.display='0.'; pad.fresh=false;} else if(!pad.display.includes('.')) pad.display+='.';} else if(kind==='op'){if(pad.op&&!pad.fresh) padApply(); else pad.acc=padNum(); pad.op=btn.dataset.op; pad.fresh=true; if(pad.display==='Error'){pad.display='0'; pad.acc=null; pad.op=null;}} else if(kind==='eq'){padApply();} padShow();});
$('models').addEventListener('input',e=>{if(e.target.name==='applyFund'||e.target.name==='fund'){e.target.dataset.touched='1'; delete e.target.dataset.fromTracer;}});
$('models').addEventListener('change',e=>{const form=e.target.form; if(!form) return; if(e.target.name==='applyFund'||e.target.name==='fund'){e.target.dataset.touched='1'; delete e.target.dataset.fromTracer;} if(e.target.name==='contest'){if(form.dataset.model==='dirichlet-multinomial') fillAllChoice(form); else fillChoices(form); refreshCalc(form);} else if(e.target.name==='choice'||e.target.name==='fundBaseline'){if(e.target.name==='fundBaseline'&&form.applyFund){form.applyFund.dataset.touched=''; delete form.applyFund.dataset.fromTracer;} refreshCalc(form);}});
$('models').addEventListener('click',e=>{const add=e.target.closest('[data-add]'); if(add){add.closest('form').querySelector('.calc-rows').insertAdjacentHTML('beforeend','<div class="calc-line" data-kind="manual"><label class="check"><input type="checkbox" name="use" checked> Missing year <input name="yearLabel" placeholder="e.g. 2018" maxlength="40"></label><label title="Final vote share for this choice in that year, as a fraction from 0 to 1 (0.52 = 52%).">Past share (0–1)<input name="share" type="number" min="0" max="1" step="0.0001" required></label><label>Weight<input name="weight" type="number" min="0" step="0.1" value="1"></label><label>Funding advantage<input name="fund" type="number" step="any"></label><button type="button" data-remove-share>Remove</button></div>'); return;} const removeShare=e.target.closest('[data-remove-share]'); if(removeShare){removeShare.closest('.calc-line')?.remove(); return;} const drops=e.target.closest('[data-drops]'); if(drops){const form=drops.closest('form'), entry=selectedContest(form); if(!entry) return; form.series.value=predictions.filter(p=>p.contest===entry.race&&p.snapshotId===entry.file.id).map(p=>p.votes).join(', ');}});
$('models').addEventListener('submit',e=>{if(e.target.matches('.calc')){e.preventDefault(); runCalc(e.target);}});
$('research-pick')?.addEventListener('change',()=>{fillResearchPick(true); renderResearch();});
$('research-models')?.addEventListener('change',e=>{const input=e.target.closest('[data-model]'); if(!input) return; researchModelOn[input.dataset.model]=input.checked; persistResearchModels(); renderResearch();});
$('research-history')?.addEventListener('change',e=>{const box=e.target.closest('[data-history]'); if(!box) return; const row=researchHistory[Number(box.dataset.history)]; if(row) row.use=box.checked; const scenario=$('research-scenario'); if(scenario) scenario.share.dataset.touched=''; renderResearch();});
$('research-scenario')?.addEventListener('input',e=>{const form=e.target.form; if(e.target.name==='share') form.share.dataset.touched='1'; if(e.target.name==='fundInfluence'){delete form.useFunding?.dataset.fundingSet; if(form.share) form.share.dataset.touched='';} if(e.target.name==='finalTotal'){form.auto.value=''; const state=researchState(); if(state&&form.finalTotal.value.trim()!=='') form.remaining.value=String(remainingFromFinal(state.focusVotes+state.otherVotes,Number(form.finalTotal.value))??'');} if(e.target.name==='remaining'){const state=researchState(); if(state&&form.remaining.value.trim()!=='') form.finalTotal.value=String(state.focusVotes+state.otherVotes+Number(form.remaining.value)); form.auto.value='';} renderResearch();});
$('research-scenario')?.addEventListener('change',e=>{if(e.target.name==='auto') applyResearchAuto(); if(e.target.name==='useFunding'||e.target.name==='fundBaseline'||e.target.name==='fundInfluence'){if(e.target.name==='useFunding'&&!e.target.checked){e.target.form.share.dataset.touched=''; delete e.target.dataset.fundingSet;} if(e.target.name==='fundBaseline'||e.target.name==='fundInfluence'){delete e.target.form.useFunding?.dataset.fundingSet; e.target.form.share.dataset.touched=''; fillResearchHistory();} renderResearch();}});
$('research-turnout')?.addEventListener('click',e=>{const card=e.target.closest('[data-final]'); if(!card) return; const form=$('research-scenario'), state=researchState(); form.finalTotal.value=card.dataset.final; form.auto.value=''; if(state) form.remaining.value=String(remainingFromFinal(state.focusVotes+state.otherVotes,Number(card.dataset.final))??0); renderResearch();});
$('research-drop').onsubmit=e=>{e.preventDefault();const pick=$('research-pick'), file=predictionFiles().find(s=>s.id===pick.file.value); if(!file||historicalFile(file)) return; const form=e.target, votes=Number(form.votes.value), note=form.note.value.trim(); if(!pick.contest.value||!Number.isSafeInteger(votes)||votes<0||!note) return; const asOf=form.asOf.value?new Date(form.asOf.value).toISOString():undefined; const record={id:crypto.randomUUID(),contest:pick.contest.value,snapshotId:file.id,votes,provenance:note,createdAt:new Date().toISOString(),kind:'research',scope:'experimental-analytics',schemaVersion:1}; if(asOf&&Number.isFinite(Date.parse(asOf))) record.asOf=asOf; researchDrops=[...researchDrops,record]; if(!persistResearchDrops()) return; form.votes.value=''; form.note.value=''; form.asOf.value=''; renderResearch(); toast('Scenario drop saved here only — Overview tracker unchanged.');};
$('research-drops')?.addEventListener('click',e=>{const btn=e.target.closest('[data-drop-remove]'); if(btn) removeResearchDrop(btn.dataset.dropRemove);});
$('research-drops-clear')?.addEventListener('click',()=>{const pick=$('research-pick'); if(!pick?.file.value||!pick.contest.value) return; if(!confirm('Clear all scenario drops for this contest? Overview predictions stay untouched.')) return; clearResearchDrops(pick.file.value,pick.contest.value);});
$('today').textContent=new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'America/Denver'}).format(new Date());
function enter(){$('intro').hidden=true;$('workspace').hidden=false;$('main').focus();try{localStorage.setItem('bullvixen.skipIntro',String($('remember').checked));}catch{} }
$('enter').onclick=$('skip-intro').onclick=enter;$('show-intro').onclick=()=>{$('intro').hidden=false;$('workspace').hidden=true;};
// Keep the supplied artwork intact; accessible controls align with its painted controls.
$('splash-art').onerror=()=>{$('intro').classList.add('art-unavailable');};
$('splash-art').src=splashUrl;
try{if(localStorage.getItem('bullvixen.skipIntro')==='true')$('remember').checked=true;else if(!location.hash){$('intro').hidden=false;$('workspace').hidden=true;}}catch{}
render();page(location.hash.slice(1)||'now');

loadArchives();
