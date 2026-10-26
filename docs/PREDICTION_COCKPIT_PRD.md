# Bullvixen Prediction Cockpit PRD

## Purpose

Bullvixen is a calculator for working a live contest from supplied election history and manually entered reporting drops. It should help a person answer “what has to happen from here?” without requiring them to understand statistical model terminology.

## Core workflow

1. Select a current contest.
2. Show the current count, reporting timestamp, candidate or party comparison, and compatible history for the same office and district.
3. Show historical vote totals and turnout so the user can estimate a feasible final vote total.
4. Record a new drop with its source and timestamp.
5. Adjust visible scenarios for final turnout and remaining vote allocation.
6. Show the path to victory, best case, base case, and worst case.
7. Keep formulas and advanced parameters available under a technical details section.

## Primary output

The first result is not a model name. It is:

- votes needed to lead;
- required share of the remaining vote;
- current margin and current share;
- feasible final turnout range;
- outcome under low, historical-average, and high scenarios;
- the assumptions that produced the result.

## Visual language by model

- **Historical baseline:** comparable past results as dots, a weighted baseline line, an uncertainty band, and the current result marker.
- **Remaining-vote beta:** a fan chart of final share or margin as remaining votes change, with the win threshold marked.
- **All-choice count:** a stacked final-vote bar separating reported votes from expected remaining votes for every candidate or choice.
- **Kalman time series:** timestamped drop points, a smoothed line, and an uncertainty band. The user sees trend and stability; process and observation variance remain advanced settings.
- **Markov regimes:** a state-probability ribbon showing how likely the contest is to be tight or wide at each drop.
- **Spatial model:** ranked county or district contribution bars, with a map only when geography and boundary vintage are reliable.
- **Fundraising comparison:** a funding-advantage versus final-performance scatterplot with the current contest highlighted.

## Interaction requirements

- Contest detail opens in a modal or persistent dual pane so users do not lose their place while reviewing history and changing assumptions.
- The app supplies history and reasonable turnout ranges before asking for an estimate.
- “Expected votes” is replaced by “Estimated final vote total” or “Votes remaining,” with reported votes shown beside it.
- A simple calculator is always available for current votes, opponent votes, remaining votes, and required share.
- Advanced tools are progressively disclosed. Collapsing a tool is not the accessibility solution by itself; the default state must explain what to enter and why.
- Historical elections remain read-only. Only the current election accepts new drops.

## Acceptance criteria

- A first-time user can run a baseline comparison without knowing the model formulas.
- A user can see the history used in a result and remove or change individual historical contests.
- A user can vary turnout and remaining-share assumptions and immediately see the projected winner and margin.
- Every result identifies its inputs, source timestamps, and whether it is observed, scenario-based, or modeled.
- Charts have text summaries and do not rely on color alone.
