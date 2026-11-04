// Normalizes the Colorado SOS "detail" workbook into append-only report rows.
// A report is a point in time; never merge it into another report.
export const DETAIL_SCHEMA_VERSION = 1;

const clean = value => String(value ?? '').trim();
const keyName = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function normalizeDetailWorkbook(workbook, {filename = 'detail.xlsx', sourceReportedAt, sourceUrl = '', partyByCandidate = new Map(), utils = workbook?.utils} = {}) {
  if (!workbook?.SheetNames?.length) throw Error('The workbook has no worksheets.');
  const sheetToJson=utils?.sheet_to_json;
  if(typeof sheetToJson!=='function') throw Error('The workbook reader is unavailable. Refresh once and try again.');
  const reports = [];
  const seen = new Set();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheetToJson(sheet, {header: 1, defval: ''});
    if (!rows.length) continue;
    const title = clean(rows[0]?.[0]);
    if (!title || /table of contents|registered voters/i.test(title)) continue;
    const names = (rows[1] || []).map(clean);
    const header = (rows[2] || []).map(clean);
    if (header[0].toLowerCase() !== 'county' || header[1].toLowerCase() !== 'registered voters') continue;
    const candidates = [];
    for (let col = 2; col < names.length; col++) {
      const name = names[col];
      if (name && !candidates.some(candidate => candidate.col === col || candidate.name === name)) candidates.push({col, name});
    }
    if (!candidates.length) continue;
    for (let rowIndex = 3; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const county = clean(row[0]);
      if (!county || /^total\s*:/i.test(county) || /^total$/i.test(county)) continue;
      const registeredVoters = parseCount(row[1]);
      for (const candidate of candidates) {
        const votes = parseCount(row[candidate.col]);
        if (votes == null) continue;
        const id = [title, county, candidate.name].map(keyName).join('|');
        if (seen.has(id)) throw Error(`Duplicate detail row: ${title} · ${county} · ${candidate.name}.`);
        seen.add(id);
        reports.push({
          race: title,
          candidate: candidate.name,
          county,
          party: partyByCandidate.get(keyName(candidate.name)) || '',
          votes,
          registeredVoters,
          sourceSheet: sheetName,
        });
      }
    }
  }
  if (!reports.length) throw Error('No contest rows were found. Use the Colorado SOS detail workbook.');
  const asOf = new Date(sourceReportedAt || Date.now());
  if (!Number.isFinite(asOf.getTime())) throw Error('Enter a valid report timestamp.');
  return {
    schemaVersion: DETAIL_SCHEMA_VERSION,
    id: `co-2026-detail-${asOf.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    election: '2026 General',
    label: `Colorado SOS detail report · ${asOf.toISOString()}`,
    filename,
    sourceUrl,
    sourceReportedAt: asOf.toISOString(),
    importedAt: new Date().toISOString(),
    records: reports,
  };
}

export function detailReportToSnapshot(report) {
  return {
    id: report.id,
    filename: report.filename,
    election: report.election,
    kind: 'observed',
    stage: 'unofficial',
    asOf: report.sourceReportedAt,
    importedAt: report.importedAt,
    url: report.sourceUrl,
    attested: true,
    schemaVersion: 1,
    detailReport: true,
    records: report.records.map(({race, candidate, county, party, votes}) => ({race, candidate, county, party, votes})),
    contests: [...new Set(report.records.map(row => row.race))].map(race => ({race, position: '', districtLabel: ''})),
  };
}

function parseCount(value) {
  const text = clean(value).replace(/,/g, '');
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}
