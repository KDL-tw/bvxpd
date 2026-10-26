import test from 'node:test';
import assert from 'node:assert/strict';
import {fanPoints, pathToVictory, projectOutcome, remainingFromFinal, scenarioBoard, turnoutScenarios} from '../src/scenarios.js';

test('path to victory names the share of remaining votes needed to lead', () => {
  const result = pathToVictory({focusVotes: 100, otherVotes: 120, remaining: 100});
  assert.equal(result.ok, true);
  assert.equal(result.votesNeeded, 61);
  assert.ok(Math.abs(result.requiredShare - 0.6) < 1e-9);
  assert.match(result.summary, /60\.0%/);
});

test('an already leading choice needs less than half of the remaining vote', () => {
  const result = pathToVictory({focusVotes: 120, otherVotes: 100, remaining: 100});
  assert.equal(result.votesNeeded, 41);
  assert.ok(Math.abs(result.requiredShare - 0.4) < 1e-9);
});

test('zero remaining reports the race as decided on the entered numbers', () => {
  const result = pathToVictory({focusVotes: 10, otherVotes: 8, remaining: 0});
  assert.equal(result.alreadyDecided, true);
  assert.equal(result.votesNeeded, 0);
  assert.equal(result.requiredShare, null);
});

test('projectOutcome keeps remaining votes as an explicit input', () => {
  const result = projectOutcome({focusVotes: 50, otherVotes: 50, remaining: 100, focusShare: 0.6});
  assert.equal(result.focusFinal, 110);
  assert.equal(result.otherFinal, 90);
  assert.equal(result.winner, 'focus');
});

test('turnout scenarios build low, average, and high from selected history', () => {
  const result = turnoutScenarios([30000, 20000, 40000]);
  assert.deepEqual(result.rows.map(row => [row.id, row.finalTotal]), [
    ['low', 20000],
    ['base', 30000],
    ['high', 40000]
  ]);
});

test('scenario board returns best, base, and worst without writing a count', () => {
  const board = scenarioBoard({focusVotes: 100, otherVotes: 100, estimatedFinal: 300, focusShare: 0.5, spread: 0.1});
  assert.equal(board.remaining, 100);
  assert.equal(board.cases[0].id, 'best');
  assert.equal(board.cases[1].winner, 'tie');
  assert.equal(board.cases[0].winner, 'focus');
  assert.equal(board.cases[2].winner, 'other');
  assert.equal(remainingFromFinal(200, 150), 0);
});

test('fan points mark margin as remaining votes change', () => {
  const points = fanPoints({focusVotes: 100, otherVotes: 100, maxRemaining: 100, focusShare: 0.55, steps: 2});
  assert.equal(points.length, 3);
  assert.equal(points[0].remaining, 0);
  assert.equal(points[2].remaining, 100);
  assert.ok(points[2].marginPp > 0);
});
