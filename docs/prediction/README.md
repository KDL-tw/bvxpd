# Prediction mathematics and functionality

Status: **design notes, not an implemented forecasting engine**. Updated October 25, 2026.

Bullvixen currently calculates descriptive results from a selected snapshot. It does not predict final votes, turnout, winners, or win probabilities. The Research laboratory checkboxes are session-only interface controls; they do not fit, run, save, or combine models. This document separates the mathematics that runs today from proposed work that needs data, implementation and evaluation.

See the [project README](../../README.md) for installation, source coverage and the outstanding-work list.

## 1. Organizing unit: position and district

The analytical hierarchy is:

**Election → position → district/seat → geographic reporting unit → candidate or ballot choice.**

Candidates are outcomes within a contest, not the identity of a contest. For example, `co-2022-general:us-house:8` identifies the 2022 general-election contest for Colorado's eighth U.S. House district regardless of which candidates ran. Changing a candidate name must not create a new position/district.

The bundled historical dataset has a `contests` catalog containing `id`, `positionId`, `position`, `district`, `districtLabel`, and `geographyVintage`. Each result row references a `contestId`. Current arithmetic still selects rows by the unique display `race` within one snapshot; the archive validator checks the connection to its contest ID. A full migration of manual imports and all queries to structured contest IDs remains outstanding.

Cross-year comparison requires an explicit crosswalk. A district numbered 8 in two years is not necessarily the same geographic area. Statewide U.S. Senate races also require seat/class identification before joining years. These relationships are not implemented. Never match historical contests by candidate surname or assume that the current election-scoped identifier establishes comparable boundaries across years.

## 2. Mathematics implemented today

Source: [`src/data.js`](../../src/data.js), `summarize`, and [`src/app.js`](../../src/app.js), `render`.

Let `r` be one contest in one selected snapshot, `G` the selected imported geography, and `v(c,g)` the recorded votes for candidate/choice `c` in reporting area `g`.

### Candidate votes and total

```text
V(c) = Σ[g in G] v(c,g)
T    = Σ[c] V(c)
```

Only the selected snapshot contributes. Earlier cumulative snapshots are never summed with later cumulative snapshots. Statewide aggregate rows must not be combined with their constituent county rows.

`T` is candidate votes in the supplied data, not ballots cast, registered voters, turnout, estimated final votes or percent reporting. For a House contest, a county row covers the portion of that county within the district. Votes from different races are not added into an election-wide ballot count.

### Vote share

```text
share(c) = 100 × V(c) / T
```

The display uses two decimal places. If `T = 0`, shares display `—`; the count remains zero. Rounding can make displayed shares sum to slightly more or less than 100%. A displayed `0.00%` can represent a positive but very small count; the exact count stays visible.

### Top-two margin

Order candidates by recorded votes, descending. The displayed margin is:

```text
margin_pp = 100 × (V(first) - V(second)) / T
```

The denominator includes **all imported choices**, not just the leading two. The margin is in percentage points, not a win probability or a relative percentage increase. If fewer than two choices exist, or `T = 0`, the margin displays `—`. A tie gives `0.00 pp`; alphabetical tie ordering is only display ordering and does not declare a winner.

Example from the bundled 2022 House District 8 abstract:

```text
Caraveo:    114,377
Kirkmeyer:  112,745
Ward:         9,280
Long:            99
Total:      236,501
Margin: 100 × (114,377 - 112,745) / 236,501 = 0.69 pp (rounded)
```

The figures are observations from the [official House abstract](https://www.sos.state.co.us/pubs/elections/Results/Abstract/2022/general/usRepresentatives.html), not model output.

### Coverage and reconciliation

- Area count is the number of distinct area labels represented in the selection. It does not establish completeness or percent reporting.
- Race count is the number of races in the selected snapshot, even when the position filter narrows the visible contest list.
- The historical adapter checks that each county's candidate counts sum to its published candidate total.
- For each candidate it checks that the county counts sum to the published statewide or district candidate total.
- Published aggregate Total rows are retained as validation targets, not added as result rows.
- Registered-voter, ballots-cast and turnout columns are deliberately excluded from the candidate-results dataset.

## 3. Functionality and implementation status

| Capability | Status | Current behavior or missing prerequisite |
| --- | --- | --- |
| Vote totals, shares, top-two margin | Implemented | Descriptive arithmetic above |
| Historical final results | Implemented for selected 2022 races | Ten races, 1,381 county/candidate rows; not the full ballot |
| Position/district categorization | Implemented for bundled archive | Manual imports without metadata remain Unmapped position |
| Source provenance and independent snapshots | Implemented | Pinned sources and checksums for bundled history; local metadata for manual files |
| Forecast output or win probability | Not implemented | No training, inference or simulation code |
| Historical baseline | UI placeholder | Needs more years and comparable geography/seat mappings |
| Bayesian hierarchical model | UI placeholder | Needs a target, likelihood, priors, fitting and validation |
| Kalman filter | UI placeholder | Needs an observed time series and a defined state/observation model |
| Markov regimes | UI placeholder | Needs evidence for regimes and estimated transition/emission models |
| Spatial analysis | UI placeholder | Needs geographic relationships, boundary versions and validated assumptions |
| Days-out ballot returns | Planned | Separate ballot-return schema and timestamped observations |
| Election-night nowcast | Planned | Comparable snapshots, known reporting scope and outstanding-vote estimates |
| Donor/finance analysis | Planned | Separate ingestion, entity resolution and evaluation |
| Replay, change points, anomaly flags | Planned | Timestamped input history and tests; flags must not imply misconduct |

## 4. Proposed first prediction design — not implemented

The first predictive milestone should be a simple historical baseline, followed by one evaluated remaining-vote model. These are proposed designs; no parameters below are fitted, no accuracy is claimed, and selecting a checkbox does not enable them.

### A. Historical baseline

For compatible prior contests `h`, define a consistently measured share `s(h)` and predeclared nonnegative weights `w(h)`:

```text
baseline_share = Σ[h] w(h) × s(h) / Σ[h] w(h)
```

The target must be specified before fitting: a party's share, a ballot choice's share, or another consistently defined quantity. Candidate identities cannot be carried across elections by default. Party realignment, uncontested races, special elections, primary parties and boundary changes require explicit handling. Choose weights through historical validation, not by assuming the most recent race is always the most informative. With no compatible history, return unavailable instead of manufacturing a baseline.

### B. Remaining-vote model for a two-choice target

For a fixed contest and reporting unit `g`, let `y(g)` be observed votes for choice A, `n(g)` observed votes for the two included choices, and `R(g)` the unknown remaining votes for those same choices. A possible starting point is:

```text
p(g) ~ Beta(alpha(g), beta(g))
y(g) | n(g), p(g) ~ Binomial(n(g), p(g))
p(g) | data ~ Beta(alpha(g) + y(g), beta(g) + n(g) - y(g))
remaining_A(g) | R(g), p(g) ~ Binomial(R(g), p(g))
final_A = observed_A + Σ[g] remaining_A(g)
```

This conjugate update assumes observed and remaining votes are exchangeable conditional on the modeled unit. Real reporting order can violate that assumption. It is a baseline to test, not a ready election-night model. `R(g)` needs a separately estimated distribution from credible outstanding-vote information; it cannot be derived from candidate totals or number of counties alone. Model the uncertainty in `R(g)` as well as in `p(g)`.

A two-choice model must explicitly exclude or separately model other choices and label its denominator. It must not treat the entire ballot count as two-choice votes. For all-choice predictions, a proposed alternative is a Dirichlet prior and multinomial remaining-vote allocation, with a jointly modeled number of remaining valid candidate votes. Do not mix outputs from different denominators.

### C. Simulation and output

For each simulation draw, jointly sample remaining vote counts, geographic vote shares and shared effects, then add simulated remaining votes to observed counts. Calculate contest-level final shares and margins from that draw. The estimated probability that A has the largest vote total is the fraction of draws where A leads; handle exact ties explicitly.

Report predictive intervals, the data cutoff, model/version, random seed and key assumptions. A probability of leading in simulated final counts is not an official winner call. Independent county simulations can understate uncertainty when errors are correlated; a later hierarchical model must represent common shocks and be evaluated against a simpler baseline.

### D. More complex model families

Kalman, regime-switching and spatial approaches remain research options, not commitments to combine everything. A time-series model would need a defined latent state, an observation process and an error model; a regime model would need observable justification for states and transitions. Additional complexity should be adopted only if out-of-sample evaluation improves the declared target and calibration. No coefficients, priors, regime counts or model weights have been chosen.

## 5. Data required before forecasting

1. More comparable historical elections, matched by position, district/seat and boundary vintage.
2. For a pre-election model, predictors with recorded availability dates and a clearly defined forecast cutoff.
3. For an election-night model, snapshots as actually available at each time, reporting-unit definitions, vote-method/batch information where available, and credible outstanding-vote estimates.
4. Final outcomes as evaluation labels, kept separate from time-of-forecast inputs.
5. Explicit correction/revision handling; negative snapshot differences can be corrections and must not be silently clipped to zero.

Final static results alone cannot reconstruct election-night reporting order, train a days-out time series, establish remaining votes or validate live win probabilities. The current static batch is a foundation for descriptive history and future outcome labels.

## 6. Evaluation and release criteria — proposed

- Use time-ordered held-out elections. Fit preprocessing, priors, crosswalk decisions and model choices without using the held-out outcome.
- Replay only information available at each claimed prediction time. Preserve source availability time separately from download time and election date.
- Compare with a declared simple baseline; report sample size and results by position, district type and forecast horizon.
- For a binary probability `p` and outcome `y` in `{0,1}`, evaluate mean Brier loss `(p-y)^2` and mean log loss `-[y log(p) + (1-y) log(1-p)]`. If probabilities are clipped for numerical stability, declare the clipping rule. These metrics are not currently computed.
- Evaluate calibration, margin/share error and predictive-interval coverage. State whether intervals are 80%, 95% or another predeclared level; do not select levels after seeing outcomes.
- Test zero counts, ties, uncontested races, third parties, missing counties, delayed batches, revisions, boundary changes and unavailable sources.
- Freeze input hashes, model version, configuration, seed and evaluation output for each release.

Before a forecast is exposed, implement and test the pipeline, define an uncertainty policy, document limitations and pass a predeclared evaluation gate. Numerical acceptance thresholds remain an open decision, not a passed requirement.

## 7. Outstanding prediction work, in order

1. Complete historical coverage and the position/district/seat crosswalk.
2. Choose the first prediction target and forecast horizon; document exclusions and required data.
3. Build a leakage-resistant historical evaluation dataset and baseline.
4. Collect genuine timestamped snapshots if election-night predictions are pursued.
5. Implement one model and predictive simulation with explicit missing-data behavior.
6. Evaluate calibration and error against the baseline; set release thresholds.
7. Add forecast-specific UI and exports that keep observed, demo and modeled values visibly separate.

There is no scheduled model execution, model registry, forecast API, production forecast or winner-call functionality at this stage.
