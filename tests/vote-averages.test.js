import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarize} from '../src/data.js';
import {contestSeat, districtKey, officeKey, pastVoteAverages} from '../src/vote-averages.js';

function load(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url)));
}

function rowsFrom(file) {
  return (file.contests || []).flatMap(contest => {
    const seat = contestSeat(file, contest);
    if (!seat || !file.records?.some(row => row.race === contest.race)) return [];
    return [{...seat, total: summarize(file.records, contest.race).total}];
  });
}

const subject = (position, district, race) => contestSeat(
  {id: 'co-2026-general-candidates', year: 2026, election: '2026 General'},
  {position, districtLabel: district, race}
);

test('office and district labels line up across files', () => {
  assert.equal(officeKey('U.S. House of Representatives'), officeKey('U.S. House'));
  assert.equal(officeKey('State House of Representatives'), officeKey('Colorado State House'));
  assert.equal(officeKey('State Senate'), officeKey('Colorado State Senate'));
  assert.equal(officeKey('Attorney General'), officeKey('Colorado Attorney General'));
  assert.equal(officeKey('District Court'), '');
  assert.equal(officeKey('Governor / Lieutenant Governor'), '');
  assert.equal(districtKey('1'), '1');
  assert.equal(districtKey('District 1'), '1');
  assert.equal(districtKey('District 10'), '10');
  assert.equal(districtKey('State'), districtKey('Statewide'));
});

test('state house district 1 averages the current map only', () => {
  const files = ['co-2020-state-house.json', 'co-2022-state-house.json', 'co-2024-legislative.json'].map(name => load(`../data/historical/${name}`));
  const options = pastVoteAverages(subject('State House of Representatives', '1', 'State House of Representatives - 1'), files.flatMap(rowsFrom));
  assert.equal(options.length, 1);
  assert.equal(options[0].n, 2);
  assert.equal(options[0].votes, 30882);
  assert.deepEqual(options[0].rows.map(row => row.year), [2024, 2022]);
});

test('a different office with the same district number stays out', () => {
  const house = rowsFrom(load('../data/historical/co-2022-state-house.json'));
  const options = pastVoteAverages(subject('U.S. House of Representatives', '1', 'U.S. House of Representatives - 1'), house);
  assert.deepEqual(options, []);
});

test('one prior contest is not an average', () => {
  const general = load('../data/historical/co-2022-general.json');
  const options = pastVoteAverages(subject('U.S. House of Representatives', '1', 'U.S. House of Representatives - 1'), rowsFrom(general));
  assert.deepEqual(options, []);
});

test('statewide offices can use earlier years', () => {
  const files = ['co-2018-attorney-general.json', 'co-2022-attorney-general.json'].map(name => load(`../data/historical/${name}`));
  const options = pastVoteAverages(subject('Attorney General', 'State', 'Attorney General - State'), files.flatMap(rowsFrom));
  assert.equal(options.length, 1);
  assert.equal(options[0].votes, 2479141);
  assert.deepEqual(options[0].rows.map(row => row.year), [2022, 2018]);
});

test('past 3 is offered only when three contests agree', () => {
  const seat = {office: 'state-house', district: '4', year: 2026, vintage: '', cycle: '2022', fileId: 'now'};
  const row = (year, total) => ({...seat, year, total, fileId: `y${year}`, election: String(year)});
  const options = pastVoteAverages(seat, [row(2024, 30), row(2022, 20), row(2018, 10), row(2024, 99)]);
  assert.deepEqual(options.map(option => option.n), [2]);
  assert.equal(options[0].votes, 15);
  const clean = pastVoteAverages(seat, [row(2024, 30), row(2022, 20), row(2018, 10)]);
  assert.deepEqual(clean.map(option => [option.n, option.votes]), [[2, 25], [3, 20]]);
});

test('a zero total and the current file are not prior contests', () => {
  const seat = {office: 'attorney-general', district: 'state', year: 2026, vintage: '', cycle: 'statewide', fileId: 'now'};
  const options = pastVoteAverages(seat, [
    {...seat, year: 2022, total: 0, fileId: 'a'},
    {...seat, year: 2018, total: 10, fileId: 'now'}
  ]);
  assert.deepEqual(options, []);
});
