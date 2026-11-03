import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDetailWorkbook, detailReportToSnapshot} from '../src/detail-report.js';

function workbook(rows) {
  return {SheetNames:['Senate'],Sheets:{Senate:{}},utils:{sheet_to_json:()=>rows}};
}

test('detail reports preserve timestamp, district pool and candidate rows', () => {
  const report=normalizeDetailWorkbook(workbook([
    ['United States Senator (Vote For 1)'],
    ['', '', 'Alice', '', 'Bob'],
    ['County', 'Registered Voters', 'Total Votes', '', 'Total Votes'],
    ['Adams', '100', '10', '', '20'],
    ['Total:', '100', '30', '', '20'],
  ]), {sourceReportedAt:'2026-11-03T19:00:00Z', partyByCandidate:new Map([['alice','DEM']])});
  assert.equal(report.schemaVersion,1);
  assert.equal(report.records.length,2);
  assert.equal(report.records[0].registeredVoters,100);
  assert.equal(report.records[0].party,'DEM');
  const snapshot=detailReportToSnapshot(report);
  assert.equal(snapshot.detailReport,true);
  assert.equal(snapshot.records[1].votes,20);
  assert.equal(snapshot.attested,true);
});

test('detail reports reject duplicate contest-area-candidate rows', () => {
  assert.throws(() => normalizeDetailWorkbook(workbook([
    ['Contest'], ['', '', 'Alice'], ['County','Registered Voters','Total Votes'],
    ['Adams','100','1'], ['Adams','100','2'],
  ]), {sourceReportedAt:'2026-11-03T19:00:00Z'}), /Duplicate detail row/);
});
