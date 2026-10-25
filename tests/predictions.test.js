import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionUnavailable, validatePrediction, plannedPredictionCatalog, historicalBaseline, testFundraisingHypothesis, fundraisingAdjustedBaseline, betaInterval, remainingVoteBeta, allChoiceCount, kalmanFilter, markovRegimes, spatialAssociation} from '../src/predictions.js';

test('unavailable prediction carries no estimate', () => {
  const p = predictionUnavailable({contestId:'co-2022-general:us-house:8', reason:'No implemented model.'});
  assert.equal(p.kind, 'modeled');
  assert.equal(p.unavailable, true);
  assert.equal(validatePrediction(p).estimate, null);
});

test('prediction validation rejects estimates marked unavailable', () => {
  const p = predictionUnavailable({contestId:'co-2022-general:us-house:8', reason:'blocked'});
  p.estimate = {candidate:'A', share:0.5};
  assert.throws(() => validatePrediction(p), /Unavailable predictions/);
});

test('catalog exposes planned model requirements without enabling them', () => {
  assert.equal(plannedPredictionCatalog.length, 6);
  assert.ok(plannedPredictionCatalog.every(p => ['planned','blocked'].includes(p.status)));
});

test('historical baseline averages only compatible weighted shares and returns an interval', () => {
  const p=historicalBaseline({contestId:'co:house:8',target:'DEM final share',histories:[{share:.48,weight:1},{share:.52,weight:2},{share:.99,compatible:false}]});
  assert.equal(p.status,'evaluated');
  assert.equal(p.sampleSize,2);
  assert.ok(Math.abs(p.estimate-(.48+1.04)/3)<1e-9);
  validatePrediction(p);
});

test('historical baseline refuses missing history', () => {
  const p=historicalBaseline({contestId:'co:house:8',target:'DEM final share'});
  assert.equal(p.unavailable,true);
  validatePrediction(p);
});

test('fundraising hypothesis reports positive association without claiming causation', () => {
  const result=testFundraisingHypothesis([{fundingAdvantage:-1,outcomeShare:.42},{fundingAdvantage:0,outcomeShare:.5},{fundingAdvantage:1,outcomeShare:.58}]);
  assert.equal(result.status,'evaluated');
  assert.ok(result.correlation>0);
  assert.match(result.conclusion,/does not establish causation/);
});

test('fundraising hypothesis refuses a thin sample', () => {
  assert.equal(testFundraisingHypothesis([{fundingAdvantage:1,outcomeShare:.6}]).status,'insufficient-data');
});

test('beta interval for a uniform prior is the central 95 percent', () => {
  const [lo, hi] = betaInterval(1, 1);
  assert.ok(Math.abs(lo - 0.025) < 0.01);
  assert.ok(Math.abs(hi - 0.975) < 0.01);
});

test('remaining-vote beta updates the prior and keeps remaining votes as an input', () => {
  const p = remainingVoteBeta({contestId: 'co:senate', target: 'DEM', alpha: 1, beta: 1, observed: 3, paired: 4, remaining: 6});
  assert.equal(p.estimate, 4 / 6);
  assert.equal(p.expectedFinal, 7);
  assert.equal(p.remaining, 6);
  validatePrediction(p);
  assert.equal(remainingVoteBeta({contestId: 'co:senate', target: 'DEM', alpha: 1, beta: 1, observed: 5, paired: 4, remaining: 0}).unavailable, true);
});

test('all-choice count allocates supplied remaining votes by the posterior', () => {
  const p = allChoiceCount({contestId: 'co:house:8', target: 'A', remaining: 4, choices: [{name: 'A', prior: 1, votes: 3}, {name: 'B', prior: 1, votes: 1}]});
  assert.ok(Math.abs(p.estimate - (17 / 3) / 8) < 1e-9);
  assert.equal(p.choices[1].expectedFinal, 1 + 4 / 3);
  validatePrediction(p);
});

test('kalman filter applies one scalar update', () => {
  const p = kalmanFilter({contestId: 'co:house:8', target: 'share', series: [1], processVariance: 0, observationVariance: 1, start: 0, startVariance: 1});
  assert.ok(Math.abs(p.estimate - 0.5) < 1e-12);
  assert.ok(Math.abs(p.interval[0] - (0.5 - 1.96 * Math.sqrt(0.5))) < 1e-12);
  validatePrediction(p);
});

test('markov regimes steps a supplied transition matrix', () => {
  const p = markovRegimes({contestId: 'co:house:8', target: 'regime', transitions: [[0.8, 0.2], [0.3, 0.7]], start: [1, 0], steps: 2, states: ['Tight', 'Wide']});
  assert.ok(Math.abs(p.estimate - 0.7) < 1e-12);
  assert.ok(Math.abs(p.distribution[1] - 0.3) < 1e-12);
  validatePrediction(p);
  assert.equal(markovRegimes({contestId: 'co:house:8', target: 'regime', transitions: [[0.8, 0.3], [0.3, 0.7]], start: [1, 0]}).unavailable, true);
});

test('spatial association returns Moran\'s I for supplied neighbor pairs', () => {
  const p = spatialAssociation({contestId: 'co:house:8', target: 'DEM', places: [{name: 'A', value: 0}, {name: 'B', value: 0}, {name: 'C', value: 1}, {name: 'D', value: 1}], pairs: [['A', 'B'], ['C', 'D']]});
  assert.ok(Math.abs(p.estimate - 1) < 1e-12);
  validatePrediction(p);
  assert.equal(spatialAssociation({contestId: 'co:house:8', target: 'DEM', places: [{name: 'A', value: 0}, {name: 'B', value: 1}, {name: 'C', value: 2}], pairs: [['A', 'Z']]}).unavailable, true);
});

test('fundraising adjustment applies the fitted comparison effect and preserves inputs', () => {
  const p=fundraisingAdjustedBaseline({contestId:'co:house:8',target:'DEM final share',baselineShare:.5,fundingAdvantage:1,training:[{fundingAdvantage:-1,outcomeShare:.42},{fundingAdvantage:0,outcomeShare:.5},{fundingAdvantage:1,outcomeShare:.58}]});
  assert.equal(p.status,'evaluated');
  assert.ok(p.estimate>.5);
  assert.equal(p.inputs.fundingAdvantage,1);
  validatePrediction(p);
});
