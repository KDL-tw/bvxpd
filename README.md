# Bullvixen Public Election Dashboard

By Renhorne Policy Institute. A Colorado election research workspace with explicit observed/demo separation. Static HTML, CSS and JavaScript; no backend, dependencies, automatic data feeds or model execution.

## Run and verify

Requires Node 22 for tests and Python 3 for the local preview.

```sh
npm start
# Open http://127.0.0.1:4173
npm test
npm run check
```

Serve over HTTP rather than opening index.html directly (the application uses JavaScript modules). Any static host can serve the repository root. Publishing the code does **not** publish locally imported data.

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

- Opens in observed mode with an honest empty state. Fictional built-in data is available only via Demo.
- Race, snapshot and county selection; candidate vote shares and top-two margins; multiple race cards and a local watchlist.
- Totals are candidate votes in the selected import, **not ballots cast, turnout, reporting completeness or winner calls**. County selection displays only imported coverage. Partial data can change the apparent leader.
- Source classification, election, source time, import time, file name and reporting stage remain visible. Times display in America/Denver.
- Browser-local persistence; files never upload. No sharing, server persistence or live refresh.
- Research laboratory retains explicitly unimplemented days-out, election-night, donor and model concepts. Configuration controls do not compute forecasts.

## Approved splash artwork

The repository and accessible continuation contained no final approved splash image. Only a marked-up revision reference was available, and it is not used as approved art. The introduction currently uses Colorado blue/crimson typography over a gradient. Place the final image at `assets/splash.png` and set `splashUrl` in `src/config.js` to `assets/splash.png` to activate the image hook. Open it via “Open introduction”; its preference checkbox can skip the intro on later visits. Do not substitute the annotated draft for the approved artwork.

## Data boundaries and next work

No actual results or donor records ship with the app. Do not commit imported source files or personal data. Browser storage is device-specific and is not a database or backup. Next: verified format-specific SOS adapters and fixtures, contest/county crosswalks, source-file hashes, server-side publication review, and reproducible historical analytics.
