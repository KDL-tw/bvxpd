const OFFICES = new Map([
  ['us house', 'us-house'],
  ['us house of representatives', 'us-house'],
  ['united states representative', 'us-house'],
  ['state house of representatives', 'state-house'],
  ['colorado state house', 'state-house'],
  ['state representative', 'state-house'],
  ['state senate', 'state-senate'],
  ['colorado state senate', 'state-senate'],
  ['state senator', 'state-senate'],
  ['us senate', 'us-senate'],
  ['united states senator', 'us-senate'],
  ['united states senate', 'us-senate'],
  ['attorney general', 'attorney-general'],
  ['colorado attorney general', 'attorney-general'],
  ['secretary of state', 'secretary-of-state'],
  ['state treasurer', 'treasurer'],
  ['governor', 'governor'],
  ['state board of education', 'state-board'],
  ['university of colorado board of regents', 'cu-regent']
]);
const DISTRICTED = new Set(['us-house', 'state-house', 'state-senate', 'state-board', 'cu-regent']);

export function officeKey(position) {
  const name = String(position || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  return OFFICES.get(name) || '';
}

export function districtKey(value) {
  const name = String(value || '').trim().toLowerCase().replace(/\./g, '');
  if (name === 'state' || name === 'statewide') return 'state';
  const match = name.match(/^(?:district\s+)?(\d+)$/);
  return match ? String(Number(match[1])) : '';
}

export function electionYear(file) {
  if (Number.isInteger(file?.year) && file.year >= 1900 && file.year <= 2100) return file.year;
  const dated = String(file?.electionDate || '').match(/^(19|20)\d{2}/);
  if (dated) return Number(dated[0]);
  const named = String(file?.election || file?.label || '').match(/\b(19|20)\d{2}\b/);
  return named ? Number(named[0]) : 0;
}

export function mapCycle(office, year, vintage) {
  if (!DISTRICTED.has(office)) return office ? 'statewide' : '';
  const raw = vintage == null ? '' : String(vintage).trim();
  if (raw && raw !== 'null') {
    const yearInVintage = raw.match(/(19|20)\d{2}/);
    if (yearInVintage) {
      const vintageYear = Number(yearInVintage[0]);
      if (vintageYear <= 2020) return '2012';
      if (vintageYear >= 2022) return '2022';
    }
    return `vintage:${raw}`;
  }
  if (!Number.isInteger(year)) return '';
  if (year <= 2020) return '2012';
  if (year >= 2022) return '2022';
  return '';
}

export function contestSeat(file, contest) {
  const office = officeKey(contest?.position);
  const district = districtKey(contest?.districtLabel ?? contest?.district);
  const year = electionYear(file);
  if (!office || !district || !year) return null;
  const vintage = contest?.geographyVintage ? String(contest.geographyVintage) : '';
  const cycle = mapCycle(office, year, vintage);
  if (!cycle) return null;
  return {office, district, year, vintage, cycle, race: contest.race, fileId: file?.id || '', election: file?.election || file?.label || String(year)};
}

export function pastVoteAverages(subject, rows) {
  if (!subject?.office || !subject.district || !subject.year || !subject.cycle) return [];
  const byYear = new Map();
  for (const row of rows || []) {
    if (!row || row.fileId === subject.fileId) continue;
    if (row.office !== subject.office || row.district !== subject.district) continue;
    if (!Number.isInteger(row.year) || row.year >= subject.year) continue;
    if (row.vintage && subject.vintage && row.vintage !== subject.vintage) continue;
    const cycle = row.cycle || mapCycle(row.office, row.year, row.vintage);
    if (!cycle || cycle !== subject.cycle) continue;
    if (!Number.isSafeInteger(row.total) || row.total <= 0) continue;
    const prev = byYear.get(row.year);
    if (!prev) byYear.set(row.year, {year: row.year, total: row.total, election: row.election || String(row.year)});
    else if (!prev.conflict && prev.total !== row.total) byYear.set(row.year, {conflict: true, year: row.year});
  }
  const usable = [...byYear.values()].filter(row => !row.conflict).sort((a, b) => b.year - a.year);
  const options = [];
  for (let count = 2; count <= usable.length; count++) {
    const slice = usable.slice(0, count);
    const sum = slice.reduce((acc, row) => acc + row.total, 0);
    if (!Number.isSafeInteger(sum)) break;
    options.push({n: count, votes: Math.round(sum / count), rows: slice});
  }
  return options;
}
