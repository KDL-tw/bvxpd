import {validateArchive} from './archive.js';
import {plannedPredictionCatalog, predictionUnavailable, validatePrediction} from './predictions.js';
document.getElementById('file-warning')?.remove();
import {splashUrl} from './config.js';
import {fields,parseFile,suggestedMapping,normalize,validateMeta,summarize,demo} from './data.js';
const $=id=>document.getElementById(id), fmt=n=>n.toLocaleString('en-US');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='bullvixen.snapshots.v1'; let archives=[],snapshots=[],watchlist=[],predictions=[],mode='observed',selectedId='',race='',position='All positions',county='All imported areas',table=null,draft=null,fileToken=0,liveSnapshot=null;
const time=s=>s?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Denver'}).format(new Date(s))+' MT':'Not applicable';
function toast(message){$('toast').textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').textContent='',6500);}
try {const saved=JSON.parse(localStorage.getItem(key)||'[]'); if(!Array.isArray(saved)) throw Error(); snapshots=saved.map(s=>{validateMeta(s); if(!Array.isArray(s.records)||!s.id||!Number.isFinite(Date.parse(s.importedAt))) throw Error(); normalize({headers:fields,rows:s.records.map(r=>fields.map(f=>String(r[f]??'')))},Object.fromEntries(fields.map((f,i)=>[f,i]))); return s;}); const watches=JSON.parse(localStorage.getItem('bullvixen.watchlist')||'[]'); if(Array.isArray(watches)) watchlist=watches.filter(s=>typeof s==='string'); const savedPredictions=JSON.parse(localStorage.getItem('bullvixen.predictions.v1')||'[]'); if(Array.isArray(savedPredictions)) predictions=savedPredictions;}catch{toast('Saved data could not be read. Import a source file to continue; existing storage has not been overwritten.');snapshots=[];}
function save(next){try{localStorage.setItem(key,JSON.stringify(next)); snapshots=next;return true;}catch{toast('Browser storage is unavailable or full. Download a backup and remove old snapshots, then try again.');return false;}}
function page(id){if(!['overview','imports','history','research'].includes(id)) id='overview';document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==id);document.querySelectorAll('nav button').forEach(el=>{el.classList.toggle('active',el.dataset.page===id); if(el.dataset.page===id)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}); if(id==='history')renderHistory();location.hash=id;}
document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>page(el.dataset.page)));
window.addEventListener('hashchange',()=>page(location.hash.slice(1)));
const allSnapshots=()=>[...(liveSnapshot?[liveSnapshot]:[]),...snapshots,...archives];
const isArchive=s=>archives.includes(s);
function active(){return mode==='demo'&&selectedId==='demo'?demo:allSnapshots().find(s=>s.id===selectedId&&s.kind===mode);}
function setMode(value){mode=value;selectedId=value==='demo'?'demo':allSnapshots().find(s=>s.kind==='observed')?.id||'';race='';position='All positions';county='All imported areas';render();}
$('observed-mode').onclick=()=>setMode('observed');$('demo-mode').onclick=$('explore-demo').onclick=()=>setMode('demo');
function options(el,items,value){el.innerHTML=items.map(([v,label])=>`<option value="${esc(v)}">${esc(label)}</option>`).join('');el.value=value;el.disabled=!items.length;}
function render(){
  const list=mode==='demo'?[demo,...snapshots.filter(s=>s.kind==='demo')]:allSnapshots().filter(s=>s.kind==='observed');
  if(!list.some(s=>s.id===selectedId))selectedId=list[0]?.id||'';
  options($('snapshot'),list.map(s=>[s.id,isArchive(s)?s.election:`${s.election} · ${time(s.asOf)}`]),selectedId);
  const s=active(),allNames=s?[...new Set(s.records.map(r=>r.race))]:[];
  const contests=isArchive(s)?s.contests:allNames.map(n=>({race:n,position:'Unmapped position',districtLabel:n}));
  const positions=[...new Set(contests.map(c=>c.position))];
  if(!positions.includes(position))position='All positions';
  options($('position-select'),s?['All positions',...positions].map(p=>[p,p]):[],position);
  const names=contests.filter(c=>position==='All positions'||c.position===position).map(c=>c.race);
  if(!names.includes(race))race=names[0]||'';
  const areas=s?[...new Set(s.records.filter(r=>r.race===race).map(r=>r.county))].sort():[];
  if(!areas.includes(county))county='All imported areas';
  options($('race-select'),names.map(n=>[n,position==='All positions'?n:contests.find(c=>c.race===n).districtLabel]),race);options($('county-select'),s?['All imported areas',...areas].map(n=>[n,n]):[],county);
  $('observed-mode').setAttribute('aria-pressed',String(mode==='observed'));$('demo-mode').setAttribute('aria-pressed',String(mode==='demo'));
  $('data-banner').classList.toggle('observed',mode==='observed');
  $('data-banner').textContent=mode==='demo'?'DEMO / SYNTHETIC — Fictional counts and candidates for exploring the interface. Not observed results, forecasts or current election data.':s?.id==='live-results'?'OBSERVED / LIVE FEED — Current upstream response, timestamped when this dashboard fetched it. Verify the source before publication.':s&&isArchive(s)?'OBSERVED / HISTORICAL ARCHIVE — 2022 final abstract; 10 selected races. County and candidate totals reconciled against the archived SOS tables. Not current or live results.':s?'OBSERVED / MANUAL IMPORT — User-supplied source data. Provenance is recorded; authenticity and completeness are not independently verified.':'OBSERVED — No source data imported. This workspace does not fetch live election results.';
  $('empty').hidden=!!s;$('results').hidden=!s;
  renderWatches();
  if(!s){$('race-cards').replaceChildren();return;}
  const summary=summarize(s.records,race,county),{total,candidates}=summary;
  $('vote-total').textContent=fmt(total);$('race-total').textContent=fmt(allNames.length);$('area-total').textContent=fmt(summary.areas);
  $('margin').textContent=candidates.length>=2&&total?((candidates[0].votes-candidates[1].votes)/total*100).toFixed(2)+' pp':'—';
  $('race-heading').textContent=race;$('result-badge').textContent=mode==='demo'?'DEMO':isArchive(s)?'HISTORICAL · 2022':s.stage==='certified'?'CERTIFIED · SOURCE LABEL':'UNOFFICIAL';
  $('candidates').innerHTML=candidates.map(c=>{const pct=total?c.votes/total*100:0;return `<div class="candidate"><div class="candidate-head"><div>${esc(c.name)}<small>${esc(c.party||'No party')}</small></div><div class="number"><strong>${total?pct.toFixed(2)+'%':'—'}</strong><small>${fmt(c.votes)} votes</small></div></div><div class="bar" aria-hidden="true"><span class="${/^rep/i.test(c.party)?'rep':/^dem/i.test(c.party)?'':'other'}" style="width:${pct}%"></span></div></div>`;}).join('');
  const archived=isArchive(s), check=archived?s.reconciliation.find(c=>c.race===race):null;
  const sourceLink=s.kind==='observed'?`<a href="${esc(check?.url||s.url)}" target="_blank" rel="noopener">Open Colorado SOS source ↗</a>`:'Fictional / supplied demo';
  $('source-details').innerHTML=`<dt>Classification</dt><dd>${archived?'Observed · bundled historical archive':s.kind==='observed'?'Observed · manual import':'Demo · synthetic'}</dd><dt>Election</dt><dd>${esc(s.election)}</dd>${archived?`<dt>Position / district</dt><dd>${esc(contests.find(c=>c.race===race).position)} · ${esc(contests.find(c=>c.race===race).districtLabel)}</dd>`:''}<dt>Source reporting time</dt><dd>${archived?'Not provided in archive':esc(time(s.asOf))}</dd>${archived?`<dt>Election date</dt><dd>${esc(s.electionDate)}</dd><dt>Archive retrieved</dt><dd>${esc(time(s.retrievedAt))}</dd>`:`<dt>Imported on this device</dt><dd>${esc(time(s.importedAt))}</dd>`}<dt>Reporting stage</dt><dd>${archived?'Historical final abstract':s.stage==='certified'?'Certified — per importer’s source label':'Unofficial / preliminary'}</dd><dt>File</dt><dd>${esc(check?.sourceFile||s.filename)}</dd><dt>Source</dt><dd>${sourceLink}</dd>${archived?`<dt>Coverage</dt><dd>${esc(s.coverage)}</dd><dt>Validation</dt><dd>${esc(check.reconciliation)}</dd><dt>Source SHA-256</dt><dd class="checksum">${esc(check.sha256)}</dd>`:''}`;
  $('storage-note').textContent=s?.id==='live-results'?'Live response is held in memory for this session; it is not persisted.':archived?'This historical dataset ships with the dashboard. Your manual imports remain local to this browser.':'Imports stay in this browser. They are not published to other visitors.';
  $('race-cards').innerHTML=names.map(n=>{const t=summarize(s.records,n),drops=predictions.filter(x=>x.contest===n&&x.snapshotId===s.id),p=drops[drops.length-1];return `<article class="race-card ${race===n?'selected':''}"><button data-race="${esc(n)}"><span class="eyebrow">${s.kind.toUpperCase()}</span><b>${esc(n)}</b><small>${fmt(t.total)} candidate votes · ${t.candidates.length} choices</small></button><form class="prediction-entry" data-contest="${esc(n)}"><label>Manual predicted votes<input type="number" min="0" step="1" name="votes" value="${p?.votes??''}" required></label><label>Provenance<input name="provenance" placeholder="Source or analyst note" value="${esc(p?.provenance??'')}" required></label><button type="submit">Record drop</button>${p?`<small>${drops.length} drop${drops.length===1?'':'s'} · latest ${esc(time(p.createdAt))}</small>`:''}</form></article>`;}).join('');
  $('race-cards').querySelectorAll('button[data-race]').forEach(b=>b.onclick=()=>{race=b.dataset.race;county='All imported areas';render();});$('race-cards').querySelectorAll('.prediction-entry').forEach(form=>form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),votes=Number(f.get('votes')),provenance=String(f.get('provenance')).trim();if(!Number.isSafeInteger(votes)||votes<0||!provenance)return;const record={id:crypto.randomUUID(),contest:form.dataset.contest,snapshotId:s.id,votes,provenance,createdAt:new Date().toISOString(),kind:'modeled',schemaVersion:1};predictions=[...predictions,record];try{localStorage.setItem('bullvixen.predictions.v1',JSON.stringify(predictions));$('prediction-status').textContent=`Day-of drop recorded for ${record.contest} at ${time(record.createdAt)}.`;render();}catch{$('prediction-status').textContent='Prediction could not be saved in this browser.';}});renderWatches();
}
$('position-select').onchange=e=>{position=e.target.value;race='';county='All imported areas';render();};
$('snapshot').onchange=e=>{selectedId=e.target.value;race='';position='All positions';county='All imported areas';render();};$('race-select').onchange=e=>{race=e.target.value;county='All imported areas';render();};$('county-select').onchange=e=>{county=e.target.value;render();};
function renderWatches(){$('watchlist').innerHTML=watchlist.map((n,i)=>`<div><span>${esc(n)} · watchlist only, no linked results</span><button data-index="${i}" aria-label="Remove ${esc(n)}">Remove</button></div>`).join('');$('watchlist').querySelectorAll('button').forEach(b=>b.onclick=()=>{watchlist.splice(Number(b.dataset.index),1);persistWatches();});}
function persistWatches(){try{localStorage.setItem('bullvixen.watchlist',JSON.stringify(watchlist));}catch{toast('Watchlist is available for this session only.');}renderWatches();}
$('watch-form').onsubmit=e=>{e.preventDefault();const name=$('watch-name').value.trim();if(name&&!watchlist.includes(name)){watchlist.push(name);persistWatches();}$('watch-name').value='';};
function invalidate(){draft=null;$('preview').hidden=true;$('commit').disabled=true;}
$('import-form').addEventListener('input',invalidate);$('mapping').addEventListener('change',invalidate);
$('file').onchange=async()=>{const token=++fileToken;invalidate();table=null;$('mapping').replaceChildren();const file=$('file').files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('Maximum file size is 10 MB.');if(!/\.(csv|tsv|json)$/i.test(file.name))throw Error('Choose a CSV, TSV or JSON file.');const text=await file.text();if(token!==fileToken)return;table=parseFile(text,file.name);const mapping=suggestedMapping(table.headers);$('mapping').innerHTML=fields.map(f=>`<label>${f==='candidate'?'Candidate / choice':f[0].toUpperCase()+f.slice(1)} ${['county','party'].includes(f)?'(optional)':'*'}<select id="map-${f}"><option value="-1">${f==='county'?'Statewide totals':f==='party'?'No party column':'Select column'}</option>${table.headers.map((h,i)=>`<option value="${i}" ${mapping[f]===i?'selected':''}>${esc(h)}</option>`).join('')}</select></label>`).join('');status(`${fmt(table.rows.length)} rows parsed from ${file.name}. Review the column mapping and source details.`);}catch(e){if(token===fileToken)status(e.message,true);}};
function status(message,error=false){$('import-status').textContent=message;$('import-status').classList.toggle('error',error);}
$('import-form').onsubmit=e=>{e.preventDefault();invalidate();try{if(!table)throw Error('Select and parse a file first.');const asOf=$('as-of').value.trim();if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(asOf))throw Error('Use an ISO source timestamp including a timezone, e.g. 2024-11-06T20:30:00-07:00.');const meta=validateMeta({election:$('election').value,kind:$('kind').value,asOf,stage:$('stage').value,url:$('source-url').value.trim(),attested:$('attest').checked});const mapping=Object.fromEntries(fields.map(f=>[f,Number($('map-'+f).value)]));const records=normalize(table,mapping);draft={...meta,records,filename:$('file').files[0].name,id:crypto.randomUUID(),importedAt:new Date().toISOString(),schemaVersion:1};$('preview-body').innerHTML=records.slice(0,10).map(r=>`<tr>${[r.race,r.candidate,r.county,r.party,fmt(r.votes)].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('');$('preview-summary').textContent=`${meta.kind.toUpperCase()} · ${records.length} rows · ${new Set(records.map(r=>r.race)).size} races. Check each race’s source totals before confirming.`;$('preview').hidden=false;$('commit').disabled=false;status('Validation passed. Review the preview, then confirm to save.');}catch(err){status(err.message,true);}};
$('commit').onclick=()=>{if(!draft)return;if(snapshots.some(s=>s.kind===draft.kind&&s.election===draft.election&&s.asOf===draft.asOf&&JSON.stringify(s.records)===JSON.stringify(draft.records))){status('This snapshot is already saved. Choose it in Source history.',true);return;}if(snapshots.length>=20){status('Limit of 20 snapshots. Export and remove an older snapshot before saving.',true);return;}if(!save([draft,...snapshots]))return;mode=draft.kind;selectedId=draft.id;race='';county='All imported areas';invalidate();render();renderHistory();page('overview');toast('Snapshot saved locally. Previous imports remain separate.');};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('template').onclick=()=>download('bullvixen-demo-template.csv','race,candidate,votes,county,party\nExample Governor,Example Candidate A,1500,Adams,DEM\nExample Governor,Example Candidate B,1400,Adams,REP\nExample House District 8,Example Candidate C,900,Adams,IND\n','text/csv');
$('export').onclick=()=>{const s=active();if(s){const {records,...meta}=s;download('bullvixen-'+s.id+'.json',JSON.stringify({...meta,results:records},null,2),'application/json');}};
function renderHistory(){
  const all=allSnapshots();
  $('history-list').innerHTML=all.length?all.map(s=>`<article class="panel history-row"><div><span class="badge">${isArchive(s)?'OBSERVED · HISTORICAL':s.kind.toUpperCase()}</span><h2>${esc(s.election)}</h2><p>${isArchive(s)?'Election date: '+esc(s.electionDate):esc(time(s.asOf))} · ${esc(s.filename)}<br>${s.records.length} rows · ${new Set(s.records.map(r=>r.race)).size} races · ${isArchive(s)?'Bundled archive · totals reconciled':s.stage==='certified'?'Certified (source label)':'Unofficial'}</p></div><div class="actions"><button data-open="${esc(s.id)}">Inspect</button>${isArchive(s)?'':`<button data-delete="${esc(s.id)}">Delete</button>`}</div></article>`).join(''):'<div class="empty"><h2>No snapshots available.</h2><p>Validated imports and bundled historical archives appear here.</p></div>';
  $('history-list').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const s=allSnapshots().find(s=>s.id===b.dataset.open);mode=s.kind;selectedId=s.id;race='';render();page('overview');});
  $('history-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this snapshot from this browser? Export it first if you need a backup.')){if(save(snapshots.filter(s=>s.id!==b.dataset.delete))){render();renderHistory();}}});
}
async function refreshLive(){
  const status=$('live-status'), button=$('refresh-live'); status.textContent='Refreshing live feed…'; button.disabled=true;
  try {
    const response=await fetch('/api/live-results',{cache:'no-store'}); const payload=await response.json();
    if(!response.ok) throw Error(payload.error||'Live feed unavailable');
    const rows=payload.records.map((r,i)=>({race:String(r.race||r.contest||''),candidate:String(r.candidate||r.choice||''),county:String(r.county||r.area||'Statewide'),party:String(r.party||''),votes:Number(r.votes)}));
    if(!rows.length||rows.some(r=>!r.race||!r.candidate||!Number.isSafeInteger(r.votes)||r.votes<0)) throw Error('Live feed returned invalid candidate-result rows.');
    liveSnapshot={id:'live-results',kind:'observed',stage:'unofficial',election:payload.election||'Live Colorado results',asOf:payload.asOf||payload.fetchedAt,importedAt:payload.fetchedAt,filename:'Live upstream feed',url:payload.sourceUrl||'',records:rows,schemaVersion:1};
    mode='observed'; selectedId='live-results'; race=''; position='All positions'; county='All imported areas'; render();
    status=`Live feed updated ${time(payload.fetchedAt)}`; toast('Live results refreshed.');
  } catch(error) { status.textContent=error.message; toast('Live results are unavailable. Check the Vercel feed configuration.'); }
  finally { button.disabled=false; }
}
$('refresh-live').onclick=refreshLive;

async function loadArchives(){
  try {
    const response=await fetch('data/historical/co-2022-general.json');
    if(!response.ok)throw Error('Archive unavailable');
    archives=[validateArchive(await response.json())];
    render();renderHistory();
  }catch{toast('Historical archive could not be loaded or validated. Manual imports and demo remain available.');}
}
$('models').innerHTML=plannedPredictionCatalog.map(p=>`<label class="check"><input type="checkbox" data-model="${p.model}"> ${p.label} <small>${p.status} · ${p.requirement}</small></label>`).join('');
const predictionPlaceholder=predictionUnavailable({contestId:'position/district contest required',reason:'No forecast engine, cutoff dataset, fitted parameters or evaluation result exists yet.'});
validatePrediction(predictionPlaceholder);
$('prediction-contract').innerHTML=`<dt>Status</dt><dd>Blocked until a model is implemented and evaluated</dd><dt>Shape</dt><dd>Modeled record → contest ID → target → cutoff → model → estimate / interval / probability</dd><dt>Current value</dt><dd>Unavailable · ${predictionPlaceholder.reason}</dd><dt>Boundary</dt><dd>Predictions will never be merged into observed or demo vote snapshots.</dd>`;
$('advanced').onchange=e=>$('advanced-panel').hidden=!e.target.checked;
$('today').textContent=new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'America/Denver'}).format(new Date());
function enter(){$('intro').hidden=true;$('workspace').hidden=false;$('main').focus();try{localStorage.setItem('bullvixen.skipIntro',String($('remember').checked));}catch{} }
$('enter').onclick=$('skip-intro').onclick=enter;$('show-intro').onclick=()=>{$('intro').hidden=false;$('workspace').hidden=true;};
// Keep the supplied artwork intact; accessible controls align with its painted controls.
$('splash-art').onerror=()=>{$('intro').classList.add('art-unavailable');};
$('splash-art').src=splashUrl;
try{if(localStorage.getItem('bullvixen.skipIntro')==='true')$('remember').checked=true;else if(!location.hash){$('intro').hidden=false;$('workspace').hidden=true;}}catch{}
render();page(location.hash.slice(1)||'overview');

loadArchives();
