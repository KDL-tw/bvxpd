"""Rebuild the pinned 2022 SOS HTML abstract offline. No third-party dependencies."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/sources/co-2022-general'
OUTPUT = ROOT / 'data/historical/co-2022-general.json'


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.heading = ''
        self.heading_parts = None
        self.table = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag in ('h2', 'h3'):
            self.heading_parts = []
        if tag == 'table':
            if self.table is not None:
                raise ValueError('Nested table is unsupported')
            self.table = {'heading': self.heading, 'rows': []}
        elif tag == 'tr' and self.table is not None:
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []
        elif tag == 'br' and self.cell is not None:
            self.cell.append(' ')

    def handle_data(self, data):
        if self.heading_parts is not None:
            self.heading_parts.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ('h2', 'h3') and self.heading_parts is not None:
            self.heading = ' '.join(''.join(self.heading_parts).split())
            self.heading_parts = None
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table['rows'].append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def integer(value):
    if not re.fullmatch(r'(?:\d+|\d{1,3}(?:,\d{3})+)', value):
        raise ValueError(f'Invalid count: {value!r}')
    return int(value.replace(',', ''))


def convert_table(table, source):
    rows = table['rows']
    headers = rows[0]
    if headers[:3] != ['County', 'Registered voters', 'Ballots cast'] or headers[-2:] != ['Total', 'Turnout %']:
        raise ValueError(f'Unexpected table schema: {headers}')
    race = table['heading']
    if re.fullmatch(r'District [1-8]', race):
        race = 'U.S. House · ' + race
    choices = []
    for header in headers[3:-2]:
        match = re.fullmatch(r'(.+?)\s+\(([A-Z]+)\)(?:\s+\((Write-[Ii]n)\))?', header)
        if not match:
            raise ValueError(f'Unrecognized candidate: {header}')
        name, party, write_in = match.groups()
        choices.append((name + (' (Write-in)' if write_in else ''), party))
    records, seen, totals, published = [], set(), [0] * len(choices), None
    for row in rows[1:]:
        if len(row) != len(headers):
            raise ValueError(f'{race}: wrong column count')
        county = row[0]
        counts = [integer(v) for v in row[3:-2]]
        if sum(counts) != integer(row[-2]):
            raise ValueError(f'{race}/{county}: candidate sum differs from published row total')
        if county == 'Total':
            if published is not None:
                raise ValueError(f'{race}: duplicate total row')
            published = counts
            continue
        if not county or county in seen:
            raise ValueError(f'{race}: duplicate or blank county {county!r}')
        seen.add(county)
        for i, ((candidate, party), votes) in enumerate(zip(choices, counts)):
            totals[i] += votes
            records.append(dict(race=race, candidate=candidate, county=county, party=party, votes=votes))
    if published is None or totals != published:
        raise ValueError(f'{race}: county sums differ from published candidate totals: {totals} / {published}')
    if not race.startswith('U.S. House') and len(seen) != 64:
        raise ValueError(f'{race}: expected all 64 counties')
    return records, dict(race=race, sourceFile=source['file'], url=source['url'], sha256=source['sha256'],
                        countyCount=len(seen), candidateCount=len(choices), totalVotes=sum(totals),
                        candidateTotals=[dict(candidate=c, votes=v) for (c, _), v in zip(choices, published)],
                        reconciliation='Every county row and candidate total matches the published table.')


def contest_identity(race):
    if race == 'United States Senator':
        office_id, position, district = 'us-senate', 'U.S. Senate', 'statewide'
    elif race == 'Governor/Lieutenant Governor':
        office_id, position, district = 'governor-lt-governor', 'Governor / Lieutenant Governor', 'statewide'
    elif re.fullmatch(r'U.S. House · District [1-8]', race):
        office_id, position, district = 'us-house', 'U.S. House', race.rsplit(' ', 1)[1]
    else:
        raise ValueError(f'Unmapped position/district: {race}')
    # Election-scoped identity deliberately does not equate districts or Senate seats across years.
    return dict(id=f'co-2022-general:{office_id}:{district}', race=race,
                positionId=office_id, position=position, district=district,
                districtLabel='Statewide' if district == 'statewide' else f'District {district}',
                geographyVintage='2022' if office_id == 'us-house' else None)


def build():
    sources = json.loads((SOURCE / 'manifest.json').read_text())
    records, checks = [], []
    for source in sources:
        raw = (SOURCE / source['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source['sha256']:
            raise ValueError(f"Source checksum mismatch: {source['file']}; preserve the original and review any new revision separately")
        parser = Tables()
        parser.feed(raw.decode('utf-8-sig'))
        expected = 8 if source['file'] == 'usRepresentatives.html' else 1
        if len(parser.tables) != expected:
            raise ValueError(f"Unexpected number of tables in {source['file']}")
        for table in parser.tables:
            result, check = convert_table(table, source)
            records.extend(result)
            checks.append(check)
    if len({r['race'] for r in records}) != 10:
        raise ValueError('Expected ten distinct races')
    contests = [contest_identity(c['race']) for c in checks]
    by_race = {c['race']: c for c in contests}
    for record in records:
        record['contestId'] = by_race[record['race']]['id']
    return dict(schemaVersion=1, id='co-2022-general-abstract-v1', election='2022 General · historical abstract',
                electionDate='2022-11-08', kind='observed', stage='archived', asOf=None, importedAt=None,
                filename='Colorado SOS 2022 general-election HTML abstract (3 pages)',
                url='https://www.sos.state.co.us/pubs/elections/Results/Abstract/2022/general/index.html',
                provenance='bundled-archive', retrievedAt=max(s['retrievedAt'] for s in sources),
                coverage='U.S. Senate, Governor/Lieutenant Governor and all eight U.S. House districts only. Not the full election ballot.',
                sourceTimeNote='The archive tables provide no source reporting timestamp. Election date is not a reporting timestamp.',
                sources=sources, reconciliation=checks, contests=contests, records=records)


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--check', action='store_true', help='Verify the checked-in output matches an offline rebuild')
    options = args.parse_args()
    result = build()
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if options.check:
        if OUTPUT.read_text() != serialized:
            raise SystemExit('Historical output differs; run npm run ingest:historical and review the diff')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(serialized)
    print(f"Verified {len(result['records'])} records in {len(result['reconciliation'])} races")
    for check in result['reconciliation']:
        print(f"  {check['race']}: {check['countyCount']} counties, {check['totalVotes']:,} candidate votes")
