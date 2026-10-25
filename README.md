# Bullvixen Public Election Dashboard

By Renhorne Policy Institute. A Colorado election research workspace with explicit observed/demo separation. Static HTML, CSS and JavaScript; no backend, dependencies, automatic data feeds or model execution.

## Project status

Status as of October 25, 2026: a working local/static research dashboard with a manual import workflow and an initial historical dataset. No forecasting engine or live ingestion service is running. This README describes the code on this branch, not a deployed production service.

- [Prediction mathematics, current calculations and proposed models](docs/prediction/README.md)
- [Outstanding work](#outstanding-work)
- [Source repository](https://github.com/KDL-tw/bvxpd) · [implementation pull request](https://github.com/KDL-tw/bvxpd/pull/2)

| Area | Implemented | Remaining |
| --- | --- | --- |
| Dashboard | Approved splash; observed/demo modes; snapshot, position, contest/district and county controls; watchlist | Wider mobile/accessibility QA and automated UI tests |
| Historical ingestion | Frozen 2022 SOS tables, repeatable offline adapter, checksums and reconciled output | More years, positions and complete ballot coverage |
| Contest identity | Position/district catalog and election-scoped contest IDs for historical data | Structured identity in manual imports; cross-year boundaries and Senate seats/classes |
| Manual imports | CSV/TSV/flat JSON mapping, validation, preview, local snapshots and export | More source formats, timestamp-free archival import path, stronger revision/entity resolution |
| Research/models | Descriptive count/share/margin arithmetic and labeled planning controls | All predictive mathematics, training, replay, evaluation and forecasting |
| Hosting/storage | Static-server workflow; bundled public history; browser-local manual imports | Deployment, shared storage and publication workflow |

## Run and verify

Requires Node 22 for tests and Python 3 for the local preview.

```sh
npm start
# Open http://127.0.0.1:4173
npm test
npm run check
npm run check:historical
python3 -m unittest discover -s tests -p 'test_*.py'
```

Serve over HTTP rather than opening index.html directly (the application uses JavaScript modules). Any static host can serve the repository root. Publishing the code does **not** publish locally imported data.

## Bundled historical data

The dashboard now includes **2022 General Election** observed results from the official [Colorado SOS final abstract](https://www.sos.state.co.us/pubs/elections/Results/Abstract/2022/general/index.html): U.S. Senate, Governor/Lieutenant Governor and all eight U.S. House districts. This is **ten selected races, not the entire ballot**. There are 1,381 candidate/county records, including zero counts and listed write-ins. Both statewide races cover all 64 counties; House county rows represent each district’s portion of a county.

Contests are categorized by **position and district**, with election-scoped IDs such as `co-2022-general:us-house:8`. Candidate names are result attributes, never contest identities. The Position filter narrows the Contest / district selector. Historical House geography is tagged with vintage 2022; cross-year comparisons must explicitly account for redistricting and Senate seat/class before equating contests. Manual files without structured position metadata remain labeled Unmapped position rather than guessing from candidate names.

The original three HTML pages are frozen under `data/sources/co-2022-general/`, alongside their URLs, retrieval timestamps and SHA-256 checksums. The normalized dataset and reconciliation report are in `data/historical/co-2022-general.json`. The browser loads that checked-in file without contacting SOS. Bundled archives appear in Observed and Source history, remain separate from local imports, and cannot be deleted through browser-local history controls.

```sh
npm run ingest:historical  # deterministic offline rebuild from frozen source pages
npm run check:historical  # verify checksums and byte-identical generated output
python3 -m unittest discover -s tests -p 'test_*.py'
```

The standard-library Python adapter recognizes the exact 2022 HTML table layout, excludes registered-voter/ballot/turnout columns and the aggregate Total row, and checks **every county row total and every candidate’s summed county total** against the published values. It fails on schema changes, missing totals, duplicate counties, malformed counts, source checksum changes or mismatched totals. The browser independently validates normalized records and race/candidate totals before displaying the archive. CI checks the frozen sources, generated output and failure cases without network access.

The archive supplies an election date but no reporting timestamp. `asOf` is therefore null, and the UI explicitly says the reporting time is unavailable; retrieval time is recorded separately. Historical archive status is distinct from a manual importer’s certified label. If SOS later corrects a page, preserve this version and add an explicitly reviewed revision; do not silently replace pinned bytes or checksums.

## Manual Colorado SOS workflow

1. Visit [Colorado SOS results and data](https://www.sos.state.co.us/pubs/elections/resultsData.html) or the [historical election database](https://historicalelectiondata.coloradosos.gov/). Select one election and reporting snapshot. Save the exact source page URL and source reporting timestamp.
2. Obtain candidate-result rows as CSV, TSV or flat JSON. Search-summary exports and ballot-return files are different datasets: reshape them first, or obtain a candidate-results export. XLSX/PDF and arbitrary Colorado SOS formats are not automatically converted.
3. Keep one row per **race + candidate/choice + county**, or one statewide total per race/candidate. Include district identifiers in race names; never combine primary parties, elections, precinct detail, voting-method detail or statewide/county totals. Remove total, ballots-cast, turnout, overvote and undervote rows. Retain all candidate choices needed for the comparison. The importer validates structure but cannot prove that the selected source is complete.
4. In Import center, select the file (10 MB / 100,000 rows maximum) and map Race, Candidate/choice and Votes. County and Party are optional; without County, every row is treated as a statewide total.
5. Set classification. **Demo is the default.** Observed requires an HTTPS Colorado SOS page, election name, source timestamp with timezone, reporting stage and explicit source verification. An observed label means manually sourced, not independently authenticated. Certified is a source label, not a dashboard certification.
6. Validate, inspect the normalized preview, then confirm. Each file becomes a separate immutable snapshot. Choose its race and geography in Race overview. Previous snapshots are never summed with newer imports.
7. Use Source history to inspect or delete imports. Up to 20 snapshots are stored in localStorage, subject to browser quota. Export JSON before clearing browser data. JSON backups contain metadata and normalized `results`; to re-import, select the backup and re-enter/verify its recorded source metadata. Imported metadata is deliberately not automatically trusted.

Schema example (synthetic, not actual election results):

```csv
race,candidate,votes,county,party
Example Governor,Example Candidate A,1500,Adams,DEM
Example Governor,Example Candidate B,1400,Adams,REP
Example House District 8,Example Candidate C,900,Adams,IND
```

Quoted CSV fields, comma-formatted integer votes, UTF-8 BOM, CRLF, TSV, flat JSON arrays and `results`/`data` wrappers are supported. Blank, negative, fractional and unsafe counts, duplicate keys, mixed statewide/county rows, malformed files and inconsistent candidate parties fail validation. No import is committed until validation and review finish. Corrections are new snapshots; distinguish them by source reporting time and file name.

## Dashboard behavior

- Opens in observed mode with the bundled historical archive when available; an empty state appears when no observed dataset is available. Fictional built-in data is available only via Demo.
- Race, snapshot and county selection; candidate vote shares and top-two margins; multiple race cards and a local watchlist.
- Totals are candidate votes in the selected import, **not ballots cast, turnout, reporting completeness or winner calls**. County selection displays only imported coverage. Partial data can change the apparent leader.
- Source classification, election, source time, import time, file name and reporting stage remain visible. Times display in America/Denver.
- Manual imports use browser-local persistence and never upload. Bundled historical data ships with the repository. No live refresh or shared manual-import database.
- Research laboratory retains explicitly unimplemented days-out, election-night, donor and model concepts. Configuration controls do not compute forecasts.

## Approved splash artwork

The supplied final artwork is included unchanged at `assets/splash.png`, configured in `src/config.js`. The introduction preserves the entire composition and uses accessible live buttons aligned with the painted Enter dashboard and Skip intro controls. On narrow screens, full-size controls move below the image. Remember my preference skips the introduction on future root-page visits; Open introduction in the sidebar reopens it.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html`, `src/style.css` | Dashboard structure and responsive styling |
| `src/app.js` | Navigation, filters, import review, persistence and display calculations |
| `src/data.js` | Manual parsing, normalization and aggregation |
| `src/archive.js` | Bundled historical data and contest-identity validation |
| `src/config.js`, `assets/` | Approved artwork configuration and assets |
| `scripts/ingest-co-2022.py` | Offline source adapter and reconciliation |
| `data/sources/co-2022-general/` | Original official HTML, URLs, retrieval times and hashes |
| `data/historical/co-2022-general.json` | Generated records, contest catalog and validation totals |
| `tests/`, `.github/workflows/test.yml` | Data/adapter checks and CI configuration |
| `docs/prediction/README.md` | Implemented formulas, proposed prediction design and release requirements |

## Outstanding work

### Next implementation priorities

- [ ] Finish browser verification of the latest Position → Contest / district filter change. Earlier browser checks covered historical rendering, race/county filtering, provenance and demo separation; the position-filter check was interrupted.
- [ ] Expand historical coverage beyond the ten selected 2022 races, with format-specific adapters and fixtures for each source layout.
- [ ] Move manual imports to explicit election, position, district/seat and contest IDs. The present manual path uses supplied race labels and does not infer an office from a person's name.
- [ ] Establish cross-year district/boundary and Senate seat/class mappings before computing historical swings or comparisons.
- [ ] Add a manual historical-data path that can record an explicitly unknown source timestamp. The bundled archive supports this now; the manual importer still requires one.
- [ ] Add stable revision identification, source-file hashes for manual imports, and a reviewed update policy for corrected archives.

### Prediction and research backlog

- [ ] Choose the first predictive target, horizon and input sources.
- [ ] Implement a historical baseline and held-out evaluation; static final results do not supply election-night chronology.
- [ ] Add timestamped ballot-return and election-night datasets through separate schemas/adapters.
- [ ] Implement and validate one prediction model, simulation, uncertainty reporting and calibration before enabling forecast UI.
- [ ] Evaluate advanced model families only after a tested baseline exists.
- [ ] Design campaign-finance ingestion and retrospective donor analysis as a separate workstream.

See the [prediction README](docs/prediction/README.md) for formulas, assumptions and proposed evaluation criteria. No model listed in the UI has been implemented.

### Product and release backlog

- [ ] Mobile, keyboard, accessibility, large-import and storage-failure QA; automated browser regression tests.
- [ ] Document and implement public deployment and update procedures. A pushed branch/PR is not a deployment.
- [ ] Decide whether manual imports should remain device-local or gain shared server storage and a publication-review workflow.
- [ ] Add backup/restore UX and clearly distinguish browser-local records from bundled public datasets.
- [ ] Review and merge the implementation PR when ready; no merge is implied by these documents.

## Verification status

Current automated checks cover 15 JavaScript tests and 5 Python adapter tests, JavaScript syntax, source checksums and byte-identical offline historical regeneration. Browser checks have covered splash entry/skip, manual synthetic import and persistence, historical totals and county filtering, and observed/demo isolation. The newest position-filter browser check remains outstanding as noted above. CI configuration is included; local test success does not claim a particular remote CI run passed.

## Data boundaries

Selected official 2022 historical results ship with the app. No donor records are included. Public source snapshots intentionally belong under `data/sources/`; do not commit personal data or unreviewed manual uploads. Browser storage is device-specific, quota-limited and not a database or backup. Recorded observations, synthetic demo counts and any future modeled estimates must retain separate provenance and labeling.

## Live deployment

The dashboard can refresh current results through the Vercel function at `/api/live-results`. Configure the Vercel environment variable `LIVE_RESULTS_URL` with an approved JSON feed that returns either an array of rows or `{ "records": [...] }`. Each row must contain `race`, `candidate`, and a non-negative integer `votes`; `county`, `party`, `asOf`, and `sourceUrl` are optional. The function proxies the feed server-side, avoiding browser CORS limits, and the UI labels the response as observed/live with its fetch time. A missing or failing feed remains clearly unavailable; the bundled 2022 archive is never presented as current. Live responses are held in memory for the browser session and are not a shared database.

## Contest identity

Federal offices, Colorado legislative offices, judicial retention, and ballot measures share a structured contest identity. Candidate names and committee names are attributes; they are never used as the cross-election key. Ballot measures use Yes/No choices under a measure identifier, separate from candidate races.
