import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionUnavailable, validatePrediction, plannedPredictionCatalog, historicalBaseline, testFundraisingHypothesis, fundraisingAdjustedBaseline} from '../src/predictions.js';

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

test('fundraising adjustment applies the fitted comparison effect and preserves inputs', () => {
  const p=fundraisingAdjustedBaseline({contestId:'co:house:8',target:'DEM final share',baselineShare:.5,fundingAdvantage:1,training:[{fundingAdvantage:-1,outcomeShare:.42},{fundingAdvantage:0,outcomeShare:.5},{fundingAdvantage:1,outcomeShare:.58}]});
  assert.equal(p.status,'evaluated');
  assert.ok(p.estimate>.5);
  assert.equal(p.inputs.fundingAdvantage,1);
  validatePrediction(p);
});
