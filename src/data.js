export const fields = ['race', 'candidate', 'votes', 'county', 'party'];
export const aliases = {race:['race','contest','contest name','office'],candidate:['candidate','candidate name','choice','choice name'],votes:['votes','total votes','vote count'],county:['county','county name','jurisdiction'],party:['party','party name','political party']};
export function parseDelimited(text, delimiter = ',') {
  const rows = []; let row = [], cell = '', quoted = false, endedQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if(c === '"') { if(text[i+1] === '"') { cell += '"'; i++; } else {quoted=false; endedQuote=true;} } else cell+=c; }
    else if (c === '"') { if(cell || endedQuote) throw Error('Unexpected quote in CSV field.'); quoted=true; }
    else if (c === delimiter || c === '\n' || c === '\r') {
      row.push(cell); cell=''; endedQuote=false;
      if(c !== delimiter) { if(c==='\r' && text[i+1]==='\n') i++; if(row.some(v=>v.trim())) rows.push(row); row=[]; }
    } else { if(endedQuote) throw Error('Unexpected text after a closing quote.'); cell += c; }
  }
  if(quoted) throw Error('Unclosed quoted field.');
  row.push(cell); if(row.some(v=>v.trim())) rows.push(row);
  return rows;
}
export function parseFile(text, filename) {
  let rows;
  if (/\.json$/i.test(filename)) {
    const data = JSON.parse(text); const records = Array.isArray(data) ? data : data.results ?? data.data;
    if(!Array.isArray(records) || !records.length || records.some(r=>!r || Array.isArray(r) || typeof r!=='object')) throw Error('JSON must contain a nonempty array of records, or a results/data array.');
    const headers=[...new Set(records.flatMap(Object.keys))];
    if(records.some(r=>Object.values(r).some(v=>v!==null && typeof v==='object'))) throw Error('Nested JSON is not supported. Use flat candidate-result records.');
    rows=[headers,...records.map(r=>headers.map(k=>String(r[k]??'')))];
  } else rows=parseDelimited(text,/\.tsv$/i.test(filename)?'\t':',');
  if(rows.length<2) throw Error('A header and at least one data row are required.');
  const headers=rows[0].map(h=>h.trim());
  if(headers.some(h=>!h) || new Set(headers.map(h=>h.toLowerCase())).size!==headers.length) throw Error('Column headers must be nonempty and unique.');
  if(rows.slice(1).some(r=>r.length!==headers.length)) throw Error('Every row must have the same number of columns as the header.');
  if(rows.length>100001) throw Error('Maximum 100,000 rows. Split larger files by contest.');
  return {headers, rows:rows.slice(1)};
}
export function suggestedMapping(headers) { return Object.fromEntries(fields.map(f=>[f,headers.findIndex(h=>aliases[f].includes(h.toLowerCase().trim()))])); }
export function normalize(table, mapping) {
  for(const field of ['race','candidate','votes']) if(!Number.isInteger(mapping[field]) || mapping[field]<0 || mapping[field]>=table.headers.length) throw Error(`Map the ${field} column.`);
  const selected=Object.values(mapping).filter(i=>i>=0);
  if(new Set(selected).size!==selected.length) throw Error('Each column can only be mapped once.');
  const seen=new Set();
  const records=table.rows.map((row,i)=>{
    const get=f=>mapping[f]>=0?String(row[mapping[f]]??'').trim():'';
    const race=get('race'),candidate=get('candidate'),county=get('county')||'Statewide',party=get('party');
    if(!race || !candidate || (mapping.county>=0 && !get('county'))) throw Error(`Row ${i+2}: race, candidate and mapped county cannot be blank.`);
    const raw=get('votes');
    if(!/^(\d+|\d{1,3}(,\d{3})+)$/.test(raw)) throw Error(`Row ${i+2}: votes must be a nonnegative whole number; blanks are not zero.`);
    const votes=Number(raw.replaceAll(',',''));
    if(!Number.isSafeInteger(votes)) throw Error(`Row ${i+2}: vote count exceeds the safe numeric range.`);
    if(/^(total|grand total|all counties|state total)$/i.test(county) || /^(total|total votes|ballots cast|registered voters|overvotes|undervotes)$/i.test(candidate)) throw Error(`Row ${i+2}: remove summary/non-candidate rows before importing.`);
    const key=JSON.stringify([race,candidate,county].map(s=>s.toLowerCase()));
    if(seen.has(key)) throw Error(`Row ${i+2}: duplicate race/candidate/county. Filter to one election and one reporting level; do not combine totals with voting-method or precinct detail.`);
    seen.add(key); return {race,candidate,county,party,votes};
  });
  for(const race of new Set(records.map(r=>r.race))) {
    const group=records.filter(r=>r.race===race), counties=new Set(group.map(r=>r.county.toLowerCase()));
    if(counties.has('statewide') && counties.size>1) throw Error(`${race}: statewide and county rows cannot be combined.`);
    const parties=new Map();
    for(const r of group) {if(parties.has(r.candidate) && parties.get(r.candidate)!==r.party) throw Error(`${race}: inconsistent party for ${r.candidate}.`); parties.set(r.candidate,r.party);}
    if(!Number.isSafeInteger(group.reduce((n,r)=>n+r.votes,0))) throw Error(`${race}: total exceeds safe numeric range.`);
  }
  return records;
}
export function validateMeta(meta) {
  if(!meta.election?.trim()) throw Error('Enter an election name, including year and type.');
  if(!['demo','observed'].includes(meta.kind)) throw Error('Choose observed or demo.');
  if(!['unofficial','certified'].includes(meta.stage)) throw Error('Choose a reporting stage.');
  if(!meta.asOf || !Number.isFinite(Date.parse(meta.asOf)) || Date.parse(meta.asOf)>Date.now()+60000) throw Error('Enter a valid source timestamp that is not in the future.');
  if(meta.kind==='observed') {
    let url; try {url=new URL(meta.url);} catch {throw Error('Provide the official Colorado SOS source URL.');}
    if(url.protocol!=='https:' || !['sos.state.co.us','coloradosos.gov'].some(h=>url.hostname===h || url.hostname.endsWith('.'+h))) throw Error('Observed imports require an HTTPS Colorado SOS source page.');
    if(!meta.attested) throw Error('Confirm the file matches the source, election, timestamp and reporting level.');
  }
  return {...meta,election:meta.election.trim()};
}
export function summarize(records, race, county='All imported areas') {
  const filtered=records.filter(r=>r.race===race && (county==='All imported areas' || r.county===county));
  const candidates=new Map();
  for(const r of filtered) {const current=candidates.get(r.candidate)||{name:r.candidate,party:r.party,votes:0};current.votes+=r.votes;candidates.set(r.candidate,current);}
  const total=filtered.reduce((n,r)=>n+r.votes,0);
  return {total,candidates:[...candidates.values()].sort((a,b)=>b.votes-a.votes || a.name.localeCompare(b.name)),areas:new Set(filtered.map(r=>r.county)).size};
}
export const demo={id:'demo',filename:'Built-in fictional example',election:'2026 General · fictional demonstration',kind:'demo',stage:'unofficial',asOf:'2026-10-20T18:00:00-06:00',importedAt:null,url:'',records:[
  ...['Governor','U.S. House · District 8','State Senate · District 16'].flatMap((race,i)=>['Adams','Jefferson','Weld'].flatMap((county,j)=>[{race,county,candidate:'Example Candidate A',party:'DEM',votes:15400+i*2900+j*1800},{race,county,candidate:'Example Candidate B',party:'REP',votes:14900+i*3100+j*2100},{race,county,candidate:'Example Candidate C',party:'IND',votes:1200+i*230+j*120}]))
]};
