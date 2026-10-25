import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTracerExport} from '../src/finance.js';

test('TRACER rows normalize and aggregate by candidate, position, district and committee',()=>{
  const rows=normalizeTracerExport(['CandidateName','Office','District','CommitteeName','ContributionAmount','ReportingPeriodStart','ReportingPeriodEnd'],[
    ['A','State House','8','A for House','$100','2024-01-01','2024-06-30'],
    ['A','State House','8','A for House','$50','2024-01-01','2024-06-30'],
    ['A','State House','8','Friends of A','$25','2024-01-01','2024-06-30']
  ],'tracer.csv','2024-07-01T00:00:00Z');
  assert.equal(rows.length,2);
  assert.equal(rows.find(r=>r.committee==='A for House').receipts,150);
  assert.equal(rows[0].district,'8');
});

test('TRACER normalization requires committee and contribution columns',()=>{
  assert.throws(()=>normalizeTracerExport(['Candidate'],[['A']],'x.csv'),/needs CommitteeName/);
});
