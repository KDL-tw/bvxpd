// Path-to-victory and turnout scenarios for Experimental Analytics.
// These functions only calculate from numbers the caller supplies.
// They never invent remaining votes from a file and never write back into a count.

export function pathToVictory({focusVotes, otherVotes, remaining} = {}) {
  if (![focusVotes, otherVotes, remaining].every(n => Number.isSafeInteger(n) && n >= 0)) {
    return {ok: false, reason: 'Enter whole numbers for the current votes and the votes still out.'};
  }
  const reported = focusVotes + otherVotes;
  const lead = focusVotes - otherVotes;
  const currentShare = reported ? focusVotes / reported : 0;
  const currentMarginPp = reported ? (lead / reported) * 100 : 0;
  if (remaining === 0) {
    return {
      ok: true,
      reported,
      remaining,
      lead,
      currentShare,
      currentMarginPp,
      votesNeeded: lead > 0 ? 0 : null,
      requiredShare: null,
      alreadyDecided: true,
      leadsNow: lead > 0,
      tiedNow: lead === 0,
      summary: lead > 0
        ? 'No votes remain. This choice is ahead on the numbers entered.'
        : lead < 0
          ? 'No votes remain. This choice is behind on the numbers entered.'
          : 'No votes remain. The numbers entered are tied.'
    };
  }
  // Need x remaining votes such that focus + x > other + (remaining - x)
  // => 2x > other - focus + remaining => x > (other - focus + remaining) / 2
  const threshold = (otherVotes - focusVotes + remaining) / 2;
  const votesNeeded = Math.max(0, Math.min(remaining, Math.floor(threshold) + 1));
  const requiredShare = Math.max(0, Math.min(1, (threshold + Number.EPSILON) / remaining));
  const canCatch = votesNeeded <= remaining;
  return {
    ok: true,
    reported,
    remaining,
    lead,
    currentShare,
    currentMarginPp,
    votesNeeded: canCatch ? votesNeeded : null,
    requiredShare: canCatch ? requiredShare : null,
    alreadyDecided: false,
    leadsNow: lead > 0,
    tiedNow: lead === 0,
    canCatch,
    summary: !canCatch
      ? `Even winning every remaining vote is not enough. Need more than ${remaining.toLocaleString('en-US')} votes still out.`
      : lead > 0
        ? `To stay ahead, this choice needs about ${(requiredShare * 100).toFixed(1)}% of the ${remaining.toLocaleString('en-US')} votes still out (${votesNeeded.toLocaleString('en-US')} votes).`
        : `To take the lead, this choice needs about ${(requiredShare * 100).toFixed(1)}% of the ${remaining.toLocaleString('en-US')} votes still out (${votesNeeded.toLocaleString('en-US')} votes).`
  };
}

export function projectOutcome({focusVotes, otherVotes, remaining, focusShare} = {}) {
  if (![focusVotes, otherVotes, remaining].every(n => Number.isSafeInteger(n) && n >= 0)) {
    return {ok: false, reason: 'Enter whole numbers for the current votes and the votes still out.'};
  }
  if (!(focusShare >= 0 && focusShare <= 1)) {
    return {ok: false, reason: 'The remaining-vote share has to sit between 0 and 1.'};
  }
  const focusFinal = focusVotes + remaining * focusShare;
  const otherFinal = otherVotes + remaining * (1 - focusShare);
  const finalTotal = focusFinal + otherFinal;
  const marginVotes = focusFinal - otherFinal;
  const marginPp = finalTotal ? (marginVotes / finalTotal) * 100 : 0;
  const winner = marginVotes > 0 ? 'focus' : marginVotes < 0 ? 'other' : 'tie';
  return {
    ok: true,
    focusFinal,
    otherFinal,
    finalTotal,
    marginVotes,
    marginPp,
    winner,
    focusShare,
    remaining
  };
}

export function turnoutScenarios(totals = []) {
  const usable = [...new Set(totals.filter(n => Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!usable.length) return {ok: false, reason: 'No past vote totals are selected yet.', rows: []};
  const sum = usable.reduce((n, v) => n + v, 0);
  const avg = Math.round(sum / usable.length);
  const rows = [
    {id: 'low', label: 'Low', finalTotal: usable[0], kind: 'historical'},
    {id: 'base', label: 'Historical average', finalTotal: avg, kind: 'historical'},
    {id: 'high', label: 'High', finalTotal: usable[usable.length - 1], kind: 'historical'}
  ];
  return {ok: true, rows, sampleSize: usable.length, min: usable[0], max: usable[usable.length - 1], average: avg};
}

export function remainingFromFinal(reported, estimatedFinal) {
  if (![reported, estimatedFinal].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  return Math.max(0, estimatedFinal - reported);
}

export function scenarioBoard({focusVotes, otherVotes, estimatedFinal, focusShare, spread = 0.1} = {}) {
  const reported = focusVotes + otherVotes;
  const remaining = remainingFromFinal(reported, estimatedFinal);
  if (remaining == null || !(focusShare >= 0 && focusShare <= 1)) {
    return {ok: false, reason: 'Enter a final vote total and a remaining-vote share.'};
  }
  const path = pathToVictory({focusVotes, otherVotes, remaining});
  const clamp = share => Math.max(0, Math.min(1, share));
  const cases = [
    {id: 'best', label: 'Best case', share: clamp(focusShare + spread)},
    {id: 'base', label: 'Base case', share: focusShare},
    {id: 'worst', label: 'Worst case', share: clamp(focusShare - spread)}
  ].map(entry => ({...entry, ...projectOutcome({focusVotes, otherVotes, remaining, focusShare: entry.share})}));
  return {ok: true, reported, remaining, estimatedFinal, path, cases, assumptions: [
    `Reported votes in this calculator: ${reported}`,
    `Estimated final vote total: ${estimatedFinal}`,
    `Votes remaining: ${remaining}`,
    `Base remaining share for the focus choice: ${(focusShare * 100).toFixed(1)}%`,
    `Best/worst move that share by ±${(spread * 100).toFixed(0)} percentage points`
  ]};
}

export function fanPoints({focusVotes, otherVotes, maxRemaining, focusShare, steps = 12} = {}) {
  if (![focusVotes, otherVotes, maxRemaining].every(n => Number.isSafeInteger(n) && n >= 0) || maxRemaining === 0) return [];
  if (!(focusShare >= 0 && focusShare <= 1)) return [];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const remaining = Math.round((maxRemaining * i) / steps);
    const base = projectOutcome({focusVotes, otherVotes, remaining, focusShare});
    const best = projectOutcome({focusVotes, otherVotes, remaining, focusShare: Math.min(1, focusShare + 0.1)});
    const worst = projectOutcome({focusVotes, otherVotes, remaining, focusShare: Math.max(0, focusShare - 0.1)});
    const path = pathToVictory({focusVotes, otherVotes, remaining});
    out.push({
      remaining,
      marginPp: base.marginPp,
      bestMarginPp: best.marginPp,
      worstMarginPp: worst.marginPp,
      winThresholdShare: path.requiredShare
    });
  }
  return out;
}

// Side-by-side focus-share series for charts: actual vs projection types.
// `extra` holds toggled technical-model rows: [{id,label,value,tone?}].
export function projectionCompare({
  reportedShare = null,
  voteBaseline = null,
  fundingShare = null,
  scenarioShare = null,
  bestShare = null,
  worstShare = null,
  extra = []
} = {}) {
  const rows = [
    {id: 'actual', label: 'Reported now', value: reportedShare, tone: 'actual'},
    {id: 'vote', label: 'Vote history', value: voteBaseline, tone: 'vote'},
    {id: 'funding', label: 'Funding-adjusted', value: fundingShare, tone: 'funding'},
    {id: 'scenario', label: 'Scenario base', value: scenarioShare, tone: 'scenario'},
    {id: 'best', label: 'Best case', value: bestShare, tone: 'band'},
    {id: 'worst', label: 'Worst case', value: worstShare, tone: 'band'},
    ...extra.map(row => ({tone: 'model', ...row}))
  ].filter(row => Number.isFinite(row.value) && row.value >= 0 && row.value <= 1)
    .map(row => ({...row, pct: row.value * 100}));
  return {ok: rows.length > 0, rows};
}
