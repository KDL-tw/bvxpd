import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionUnavailable, validatePrediction, plannedPredictionCatalog} from '../src/predictions.js';

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
