import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryAverageReceipts, contestFundingAdvantage, financeDistrictKey, financeForSeat, fundingAdvantage, normalizeTracerExport, officeCategory} from '../src/finance.js';

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

test('funding advantage is log10 focus over baseline receipts',()=>{
  assert.equal(fundingAdvantage(999,999),0);
  assert.ok(fundingAdvantage(9999,999)>0);
  assert.ok(fundingAdvantage(99,9999)<0);
  assert.equal(fundingAdvantage(-1,10),null);
});

test('officeCategory buckets house and senate',()=>{
  assert.equal(officeCategory('State House District 8'),'house');
  assert.equal(officeCategory('State Senate District 1'),'senate');
  assert.equal(officeCategory('Governor'),'governor');
  assert.equal(officeCategory('Governor / Lieutenant Governor'),'governor');
  assert.equal(officeCategory('Lieutenant Governor'),'lt-governor');
});

test('financeDistrictKey treats State and Statewide as the same seat',()=>{
  assert.equal(financeDistrictKey('State'),'state');
  assert.equal(financeDistrictKey('Statewide'),'state');
  assert.equal(financeDistrictKey('8'),'8');
  assert.equal(financeDistrictKey('District 8'),'8');
});

test('financeForSeat matches Governor across State vs Statewide districts',()=>{
  const rows=[
    {candidate:'Jane Focus',position:'Governor',district:'Statewide',receipts:12000},
    {candidate:'Omar Opp',position:'Governor / Lieutenant Governor',district:'State',receipts:3000},
    {candidate:'House Cand',position:'State House',district:'8',receipts:5000}
  ];
  const seat=financeForSeat(rows,{position:'Governor',district:'State'});
  assert.equal(seat.length,2);
  assert.ok(seat.every(r=>officeCategory(r.position)==='governor'));
  const hit=contestFundingAdvantage(rows,{focusNames:['Jane Focus'],opponentNames:['Omar Opp'],position:'Governor',district:'State'});
  assert.ok(hit);
  assert.equal(hit.focusReceipts,12000);
  assert.equal(hit.opponentReceipts,3000);
});

test('unmapped contribution-report rows remain eligible for candidate matching',()=>{
  const rows=[
    {candidate:'Jane Focus',position:'Unmapped position',district:'Statewide',receipts:12000},
    {candidate:'Omar Opp',position:'Unmapped position',district:'Statewide',receipts:3000}
  ];
  const seat=financeForSeat(rows,{position:'Governor',district:'State'});
  assert.equal(seat.length,2);
  const hit=contestFundingAdvantage(rows,{focusNames:['Jane Focus'],opponentNames:['Omar Opp'],position:'Governor',district:'State'});
  assert.equal(hit.focusReceipts,12000);
  assert.equal(hit.opponentReceipts,3000);
});

test('contest funding advantage matches TRACER names in a seat',()=>{
  const rows=[
    {candidate:'Ada Focus',position:'State House',district:'8',receipts:9000},
    {candidate:'Omar Opp',position:'State House',district:'8',receipts:1000},
    {candidate:'Other Race',position:'State Senate',district:'1',receipts:50000}
  ];
  const hit=contestFundingAdvantage(rows,{focusNames:['Ada Focus'],opponentNames:['Omar Opp'],position:'State House',district:'8'});
  assert.ok(hit);
  assert.equal(hit.mode,'opponent');
  assert.equal(hit.focusReceipts,9000);
  assert.equal(hit.opponentReceipts,1000);
  assert.ok(Math.abs(hit.advantage-fundingAdvantage(9000,1000))<1e-12);
  assert.equal(contestFundingAdvantage(rows,{focusNames:['Nobody'],opponentNames:['Missing'],position:'State House',district:'8'}),null);
});

test('category funding advantage compares focus to office-type average',()=>{
  const rows=[
    {candidate:'Ada Focus',position:'State House',district:'8',receipts:9000},
    {candidate:'Omar Opp',position:'State House',district:'8',receipts:1000},
    {candidate:'Pat House',position:'State House',district:'9',receipts:5000},
    {candidate:'Sen Rich',position:'State Senate',district:'1',receipts:80000}
  ];
  const avg=categoryAverageReceipts(rows,'State House');
  assert.equal(avg,(9000+1000+5000)/3);
  const hit=contestFundingAdvantage(rows,{focusNames:['Ada Focus'],opponentNames:['Omar Opp'],position:'State House',district:'8',mode:'category'});
  assert.ok(hit);
  assert.equal(hit.mode,'category');
  assert.equal(hit.category,'house');
  assert.ok(Math.abs(hit.advantage-fundingAdvantage(9000,avg))<1e-12);
});
