// Campaign-finance records remain separate from observed vote drops and modeled estimates.
export const financeFields=['candidate','position','district','committee','periodStart','periodEnd','receipts','spending','cashOnHand','outsideSpending','smallDollarReceipts','largeDollarReceipts','source','sourceAsOf'];
const money=v=>{const n=Number(String(v??'').replace(/[$,\s]/g,''));if(!Number.isFinite(n)||n<0)throw Error('Finance amounts must be nonnegative numbers.');return Math.round(n*100)/100;};
export function normalizeFinance(row={}){const out={schemaVersion:1,kind:'finance',candidate:String(row.candidate||'').trim(),position:String(row.position||'').trim(),district:String(row.district||'Statewide').trim(),committee:String(row.committee||'').trim(),periodStart:String(row.periodStart||'').trim(),periodEnd:String(row.periodEnd||'').trim(),receipts:money(row.receipts),spending:money(row.spending),cashOnHand:money(row.cashOnHand),outsideSpending:money(row.outsideSpending||0),smallDollarReceipts:money(row.smallDollarReceipts||0),largeDollarReceipts:money(row.largeDollarReceipts||0),source:String(row.source||'').trim(),sourceAsOf:String(row.sourceAsOf||'').trim()};
if(!out.candidate||!out.position||!out.committee||!out.periodStart||!out.periodEnd||!out.source)throw Error('Finance records require candidate, position, committee, period, and source.');
if(!/^\d{4}-\d{2}-\d{2}$/.test(out.periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(out.periodEnd))throw Error('Finance periods must use YYYY-MM-DD.');
return out;}
export function financeMetrics(record){const days=Math.max(1,(Date.parse(record.periodEnd)-Date.parse(record.periodStart))/86400000+1);return {...record,netCashChange:record.receipts-record.spending,burnRate:record.spending/days,cashRunwayDays:record.spending?record.cashOnHand/(record.spending/days):null,fundraisingAcceleration:null,smallDollarShare:record.receipts?record.smallDollarReceipts/record.receipts:null,largeDollarShare:record.receipts?record.largeDollarReceipts/record.receipts:null};}
export function compareFinance(current,prior){const a=financeMetrics(current),b=prior&&financeMetrics(prior);return {...a,fundraisingAcceleration:b?a.receipts-b.receipts:null};}

// Positive when the focus side raised more than the comparison baseline. Equal money is 0.
export function fundingAdvantage(focusReceipts, baselineReceipts) {
  const focus = Number(focusReceipts), other = Number(baselineReceipts);
  if (!Number.isFinite(focus) || !Number.isFinite(other) || focus < 0 || other < 0) return null;
  return Math.log10((focus + 1) / (other + 1));
}

function nameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Coarse office bucket for category averages (house / senate / governor / statewide / other).
export function officeCategory(position = '') {
  const p = nameKey(position);
  if (!p) return 'other';
  // Joint tickets and plain Governor both count as governor; standalone Lt. Governor does not.
  if (/^governor\b/.test(p)) return 'governor';
  if (/\blieutenant governor\b|\blt governor\b/.test(p)) return 'lt-governor';
  if (/\bsenate\b/.test(p) && !/\bhouse\b/.test(p)) return 'senate';
  if (/\bhouse\b|\brepresentative\b|\bhd\b|\brep\b/.test(p)) return 'house';
  if (/\bsecretary\b|\battorney\b|\btreasurer\b|\bcontroller\b|\bregent\b/.test(p)) return 'statewide';
  return 'other';
}

// Align State / Statewide / District N with vote-seat district keys.
export function financeDistrictKey(value = '') {
  const name = String(value || '').trim().toLowerCase().replace(/\./g, '');
  if (!name) return '';
  if (name === 'state' || name === 'statewide') return 'state';
  const match = name.match(/^(?:district\s+)?(\d+)$/);
  return match ? String(Number(match[1])) : nameKey(value);
}

// Mean candidate-level receipts in the same office category across the TRACER set.
export function categoryAverageReceipts(records = [], position = '') {
  const cat = officeCategory(position);
  const byCand = new Map();
  for (const r of records) {
    if (officeCategory(r.position) !== cat) continue;
    const key = `${nameKey(r.candidate)}|${nameKey(r.district)}`;
    byCand.set(key, (byCand.get(key) || 0) + (Number(r.receipts) || 0));
  }
  const vals = [...byCand.values()].filter(v => v > 0);
  if (!vals.length) return null;
  return vals.reduce((n, v) => n + v, 0) / vals.length;
}

function namesMatch(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const ax = x.split(' '), ay = y.split(' ');
  const lastX = ax[ax.length - 1], lastY = ay[ay.length - 1];
  return lastX.length > 2 && lastX === lastY && (ax[0]?.[0] === ay[0]?.[0] || x.includes(y) || y.includes(x));
}

export function receiptsForNames(records = [], names = []) {
  const want = names.map(n => String(n || '').trim()).filter(Boolean);
  if (!want.length) return 0;
  return records.filter(r => want.some(n => namesMatch(r.candidate, n))).reduce((n, r) => n + (Number(r.receipts) || 0), 0);
}

export function financeForSeat(records = [], {position = '', district = ''} = {}) {
  const wantCat = position ? officeCategory(position) : '';
  const wantPos = nameKey(position);
  const wantDist = financeDistrictKey(district);
  if (!wantPos && !wantDist) return records;
  return records.filter(r => {
    const rCat = officeCategory(r.position);
    const okPos = !wantPos || (wantCat !== 'other' && rCat === wantCat) || nameKey(r.position).includes(wantPos) || wantPos.includes(nameKey(r.position));
    const rDist = financeDistrictKey(r.district);
    const okDist = !wantDist || rDist === wantDist;
    return okPos && okDist;
  });
}

// mode 'opponent': focus vs opponent receipts in the seat.
// mode 'category': focus vs average candidate receipts in the same office category (house, senate, …).
export function contestFundingAdvantage(records = [], {focusNames = [], opponentNames = [], position = '', district = '', mode = 'opponent'} = {}) {
  const compare = mode === 'category' ? 'category' : 'opponent';
  const pool = financeForSeat(records, {position, district});
  const focusReceipts = receiptsForNames(pool, focusNames);
  const opponentReceipts = receiptsForNames(pool, opponentNames);
  const category = officeCategory(position);
  if (compare === 'category') {
    if (focusReceipts <= 0) return null;
    const categoryAverage = categoryAverageReceipts(records, position);
    if (!categoryAverage) return null;
    const advantage = fundingAdvantage(focusReceipts, categoryAverage);
    if (advantage == null) return null;
    return {focusReceipts, opponentReceipts, categoryAverage, category, mode: 'category', advantage};
  }
  if (focusReceipts <= 0 && opponentReceipts <= 0) return null;
  const advantage = fundingAdvantage(focusReceipts, opponentReceipts);
  if (advantage == null) return null;
  return {focusReceipts, opponentReceipts, categoryAverage: null, category, mode: 'opponent', advantage};
}

const aliases={candidate:['CandidateName','Candidate','Candidate Name'],position:['Position','Office','Office Sought'],district:['District','District Number'],committee:['CommitteeName','Committee Name','Committee'],periodStart:['PeriodStart','ReportingPeriodStart','Report Period Start'],periodEnd:['PeriodEnd','ReportingPeriodEnd','Report Period End'],receipts:['ContributionAmount','Receipts','Receipt Amount'],spending:['Spending','Expenditures'],cashOnHand:['CashOnHand','Cash On Hand'],outsideSpending:['OutsideSpending','Outside Spending'],smallDollarReceipts:['SmallDollarReceipts','Small Dollar Receipts'],largeDollarReceipts:['LargeDollarReceipts','Large Dollar Receipts']};
const findColumn=(headers,names)=>{const lower=headers.map(h=>String(h).trim().toLowerCase());return names.map(n=>lower.indexOf(n.toLowerCase())).find(i=>i>=0)??-1;};
export function normalizeTracerExport(headers, rows, source, sourceAsOf=new Date().toISOString()){
  const idx=Object.fromEntries(Object.entries(aliases).map(([k,n])=>[k,findColumn(headers,n)]));
  if(idx.committee<0||idx.receipts<0) throw Error('TRACER export needs CommitteeName and ContributionAmount (or equivalent) columns.');
  const grouped=new Map();
  for(const row of rows){const value=i=>i<0?'':String(row[i]??'').trim();const candidate=value(idx.candidate)||'Committee-level';const position=value(idx.position)||'Unmapped position';const district=value(idx.district)||'Statewide';const committee=value(idx.committee)||'Unidentified committee';const key=[candidate,position,district,committee].join('|');const prior=grouped.get(key)||{candidate,position,district,committee,periodStart:value(idx.periodStart),periodEnd:value(idx.periodEnd),receipts:0,spending:0,cashOnHand:0,outsideSpending:0,smallDollarReceipts:0,largeDollarReceipts:0};prior.receipts+=Number(String(value(idx.receipts)||0).replace(/[$,\s]/g,''))||0;grouped.set(key,prior);}
  return [...grouped.values()].map(r=>normalizeFinance({...r,source,sourceAsOf}));
}
