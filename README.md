# Bullvixen Public Election Dashboard

By Renhorne Policy Institute.

Colorado-only election analysis prototype, with a cinematic intro and a restrained research-workstation interface.

## Start

Open `index.html` in a web browser. This first commit is a static prototype; no build step or backend is required.

## Current functionality

- Multiple races in a local watchlist.
- Election countdown and days-out slider.
- Toggleable model configurations and advanced-mode panel (models are **not computed yet**).
- Manual local CSV/TSV/JSON inspection for Colorado SOS exports; files stay in the browser session.
- Explicit placeholders for reporting, donor analytics, and historical comparison.

## Data integrity

No real election results are shipped, and no outcome forecast is computed. Manual data imports are preview-only: the next iteration will add schemas, crosswalks, provenance, revision handling, and reproducible analytics. Do not publish real donor PII to this public repository.

## Roadmap

1. Schema-based Colorado SOS ingestion and validation.
2. Multi-election race/contest entity resolution and historical comparison.
3. County batch reporting chronology and turnout series.
4. Retrospective finance analytics with privacy controls.
5. Proper historical replay and calibration for statistical models.
