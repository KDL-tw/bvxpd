// Modeled records stay separate from observed and demo snapshots.
// These calculators return a result from the numbers they are given.
// They do not write those numbers back into a historical file or a vote count.
export const predictionModels = ['historical-baseline', 'remaining-vote-beta', 'dirichlet-multinomial', 'kalman', 'markov-regime', 'spatial'];
export const predictionStatus = ['planned', 'blocked', 'evaluated', 'released'];

export function predictionUnavailable({contestId, target = 'final vote share', reason, model = null} = {}) {
  if (!contestId || !reason) throw Error('An unavailable prediction needs a contest and reason.');
  return {schemaVersion: 1, kind: 'modeled', status: 'blocked', contestId, target, model, unavailable: true, reason, estimate: null, interval: null, probability: null};
}

export function validatePrediction(prediction) {
  if (prediction?.schemaVersion !== 1 || prediction.kind !== 'modeled') throw Error('Prediction records must be modeled schema version 1 records.');
  if (!prediction.contestId || !prediction.target || !predictionStatus.includes(prediction.status)) throw Error('Prediction identity or status is invalid.');
  if (prediction.model !== null && !predictionModels.includes(prediction.model)) throw Error('Unknown prediction model.');
  if (prediction.unavailable !== (prediction.estimate === null && prediction.interval === null && prediction.probability === null)) throw Error('Unavailable predictions must not contain estimates.');
  if (prediction.unavailable && !prediction.reason) throw Error('Unavailable predictions need a reason.');
  return prediction;
}

// Conservative days-out baseline. It only averages explicitly supplied,
// comparable historical shares; it never matches candidates by name.
export function historicalBaseline({contestId, target, histories = [], weights = []} = {}) {
  if (!contestId || !target) throw Error('A baseline needs a contest and target.');
  if (!histories.length) return predictionUnavailable({contestId, target, model: 'historical-baseline', reason: 'No compatible historical contests were supplied.'});
  const selected = histories.map((h, i) => ({...h, weight: Number(weights[i] ?? h.weight ?? 1)})).filter(h => Number.isFinite(h.share) && h.share >= 0 && h.share <= 1 && Number.isFinite(h.weight) && h.weight > 0 && h.compatible !== false);
  if (!selected.length) return predictionUnavailable({contestId, target, model: 'historical-baseline', reason: 'Compatible history has no valid measured shares.'});
  const denominator = selected.reduce((sum, h) => sum + h.weight, 0);
  const estimate = selected.reduce((sum, h) => sum + h.share * h.weight, 0) / denominator;
  const deviations = selected.map(h => (h.share - estimate) ** 2);
  const variance = deviations.reduce((sum, v, i) => sum + selected[i].weight * v, 0) / denominator;
  const spread = Math.sqrt(variance);
  return {schemaVersion: 1, kind: 'modeled', status: 'evaluated', contestId, target, model: 'historical-baseline', unavailable: false, estimate, interval: [Math.max(0, estimate - 1.96 * spread), Math.min(1, estimate + 1.96 * spread)], probability: null, sampleSize: selected.length, assumptions: ['Explicitly comparable position/district history only', 'Weights are supplied by the caller', 'Interval reflects historical spread, not full forecast uncertainty']};
}

// Tests the fundraising-performance assumption without treating correlation as causation.
// Each observation must be a comparable contest/party outcome measured at the same cutoff.
export function testFundraisingHypothesis(observations = []) {
  const rows=observations.filter(r=>Number.isFinite(r.fundingAdvantage) && Number.isFinite(r.outcomeShare) && r.outcomeShare>=0 && r.outcomeShare<=1);
  if(rows.length<3) return {status:'insufficient-data',sampleSize:rows.length,correlation:null,slope:null,conclusion:'Need at least three comparable observations.'};
  const xm=rows.reduce((s,r)=>s+r.fundingAdvantage,0)/rows.length, ym=rows.reduce((s,r)=>s+r.outcomeShare,0)/rows.length;
  const cov=rows.reduce((s,r)=>s+(r.fundingAdvantage-xm)*(r.outcomeShare-ym),0);
  const vx=rows.reduce((s,r)=>s+(r.fundingAdvantage-xm)**2,0), vy=rows.reduce((s,r)=>s+(r.outcomeShare-ym)**2,0);
  if(vx===0||vy===0) return {status:'inconclusive',sampleSize:rows.length,correlation:null,slope:0,conclusion:'The supplied sample has no measurable variation.'};
  const correlation=cov/Math.sqrt(vx*vy), slope=cov/vx;
  return {status:'evaluated',sampleSize:rows.length,correlation,slope,conclusion:correlation>0?'Positive association observed; this does not establish causation.':correlation<0?'Negative association observed; the assumption is not supported by this sample.':'No linear association observed.'};
}

// Default slope when history cannot estimate one: +4pp of vote share per log10 funding advantage unit.
export const ASSUMED_FUNDING_SLOPE = 0.04;

export function fundraisingAdjustedBaseline({contestId, target, baselineShare, fundingAdvantage, training = [], influence = 1, assumedSlope = ASSUMED_FUNDING_SLOPE} = {}) {
  if (!contestId || !target || !Number.isFinite(baselineShare) || !Number.isFinite(fundingAdvantage)) throw Error('A fundraising-adjusted baseline needs contest, target, baseline share and funding advantage.');
  const test=testFundraisingHypothesis(training);
  const weight=Number.isFinite(influence)?Math.max(0,influence):1;
  let slope=null, slopeSource='none', conclusion=test.conclusion;
  if(test.status==='evaluated'){slope=test.slope; slopeSource='historical';}
  else if(Number.isFinite(assumedSlope)){slope=assumedSlope; slopeSource='assumed'; conclusion=`Using assumed slope ${assumedSlope} (greater funding → higher share). ${test.conclusion}`;}
  else return predictionUnavailable({contestId,target,model:'historical-baseline',reason:`Fundraising comparison unavailable: ${test.conclusion}`});
  const estimate=Math.max(0,Math.min(1,baselineShare+weight*slope*fundingAdvantage));
  return {schemaVersion:1,kind:'modeled',status:'evaluated',contestId,target,model:'historical-baseline',unavailable:false,estimate,interval:[Math.max(0,estimate-.10),Math.min(1,estimate+.10)],probability:null,sampleSize:test.sampleSize,inputs:{baselineShare,fundingAdvantage,influence:weight,slope,slopeSource},assumptions:['Greater funding than the chosen baseline is treated as a positive advantage','Influence scales how strongly that advantage moves the share (0 = off, 1 = full)','Historical slope is preferred when at least three comparable observations exist; otherwise an assumed positive slope is used','The adjustment is clipped to [0,1]','Association is not causation']};
}

function logGamma(z) {
  const p = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843696540789e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
export function betaInterval(a, b) {
  if (!(a > 0) || !(b > 0)) return null;
  const mean = a / (a + b);
  if (a + b > 200) {
    const sd = Math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1)));
    return [Math.max(0, mean - 1.96 * sd), Math.min(1, mean + 1.96 * sd)];
  }
  const quantile = p => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (regularizedBeta(mid, a, b) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return [quantile(0.025), quantile(0.975)];
}
function modeled(model, contestId, target, extra) {
  return {schemaVersion: 1, kind: 'modeled', status: 'evaluated', contestId, target, model, unavailable: false, probability: null, ...extra};
}

// Two-choice conjugate update. Remaining votes are an input, never inferred from the file.
export function remainingVoteBeta({contestId, target, alpha, beta, observed, paired, remaining} = {}) {
  if (!contestId || !target) throw Error('A remaining-vote model needs a contest and target.');
  const usable = alpha > 0 && beta > 0 && Number.isSafeInteger(observed) && observed >= 0 && Number.isSafeInteger(paired) && paired >= observed && Number.isSafeInteger(remaining) && remaining >= 0;
  if (!usable) return predictionUnavailable({contestId, target, model: 'remaining-vote-beta', reason: 'The prior, the observed votes, and the remaining votes are not usable.'});
  const a = alpha + observed, b = beta + (paired - observed), estimate = a / (a + b);
  return modeled('remaining-vote-beta', contestId, target, {estimate, interval: betaInterval(a, b), observed, paired, remaining, expectedRemaining: remaining * estimate, expectedFinal: observed + remaining * estimate});
}

// Dirichlet posterior mean for every supplied choice. Counts and remaining votes are inputs.
export function allChoiceCount({contestId, target, choices = [], remaining} = {}) {
  if (!contestId || !target) throw Error('An all-choice model needs a contest and target.');
  const usable = Number.isSafeInteger(remaining) && remaining >= 0 && choices.length >= 2 && choices.every(c => c.prior > 0 && Number.isSafeInteger(c.votes) && c.votes >= 0);
  if (!usable) return predictionUnavailable({contestId, target, model: 'dirichlet-multinomial', reason: 'Each choice needs a prior and a vote count, plus a remaining-vote total.'});
  const posteriorSum = choices.reduce((sum, c) => sum + c.prior + c.votes, 0);
  const observedTotal = choices.reduce((sum, c) => sum + c.votes, 0);
  const finalTotal = observedTotal + remaining;
  const rows = choices.map(c => {
    const posterior = c.prior + c.votes, remainShare = posterior / posteriorSum;
    const expectedFinal = c.votes + remaining * remainShare;
    return {name: c.name, votes: c.votes, prior: c.prior, expectedFinal, finalShare: finalTotal ? expectedFinal / finalTotal : 0};
  });
  const focus = rows.find(c => c.name === target) || rows[0];
  const focusPosterior = focus.prior + focus.votes;
  const [lo, hi] = betaInterval(focusPosterior, posteriorSum - focusPosterior);
  const scale = finalTotal ? remaining / finalTotal : 0;
  const base = finalTotal ? focus.votes / finalTotal : 0;
  return modeled('dirichlet-multinomial', contestId, target, {estimate: focus.finalShare, interval: [base + scale * lo, base + scale * hi], remaining, choices: rows});
}

// Scalar random-walk Kalman filter. The series, noises, and start are inputs.
export function kalmanFilter({contestId, target, series = [], processVariance, observationVariance, start = 0, startVariance = 1} = {}) {
  if (!contestId || !target) throw Error('A Kalman filter needs a contest and target.');
  const usable = series.length > 0 && series.every(z => Number.isFinite(z)) && processVariance >= 0 && observationVariance > 0 && startVariance > 0 && Number.isFinite(start);
  if (!usable) return predictionUnavailable({contestId, target, model: 'kalman', reason: 'The series and the variances are not usable.'});
  let state = start, variance = startVariance;
  const filtered = series.map(z => {
    const predictedVariance = variance + processVariance;
    const gain = predictedVariance / (predictedVariance + observationVariance);
    state = state + gain * (z - state);
    variance = (1 - gain) * predictedVariance;
    return state;
  });
  const sd = Math.sqrt(variance);
  return modeled('kalman', contestId, target, {estimate: state, interval: [state - 1.96 * sd, state + 1.96 * sd], filtered});
}

// n-step distribution of a two-state transition matrix. The matrix is an input.
export function markovRegimes({contestId, target, transitions, start, steps = 1, states = ['A', 'B']} = {}) {
  if (!contestId || !target) throw Error('A regime model needs a contest and target.');
  const rowOk = row => Array.isArray(row) && row.length === 2 && row.every(p => p >= 0 && p <= 1) && Math.abs(row[0] + row[1] - 1) < 1e-8;
  const usable = Array.isArray(transitions) && transitions.length === 2 && transitions.every(rowOk) && Array.isArray(start) && start.length === 2 && start.every(p => p >= 0 && p <= 1) && Math.abs(start[0] + start[1] - 1) < 1e-8 && Number.isSafeInteger(steps) && steps >= 1;
  if (!usable) return predictionUnavailable({contestId, target, model: 'markov-regime', reason: 'The transition rows and the starting probabilities have to sum to 1.'});
  let distribution = start.slice();
  for (let n = 0; n < steps; n++) {
    distribution = [
      distribution[0] * transitions[0][0] + distribution[1] * transitions[1][0],
      distribution[0] * transitions[0][1] + distribution[1] * transitions[1][1]
    ];
  }
  return modeled('markov-regime', contestId, target, {estimate: distribution[0], interval: null, states, distribution, steps});
}

// Moran's I for values and undirected neighbor pairs supplied by the caller.
export function spatialAssociation({contestId, target, places = [], pairs = []} = {}) {
  if (!contestId || !target) throw Error('A spatial model needs a contest and target.');
  const named = new Map(places.filter(p => p.name && Number.isFinite(p.value)).map(p => [p.name, p.value]));
  const edgeKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
  const edges = new Set();
  for (const [a, b] of pairs) {
    if (!named.has(a) || !named.has(b) || a === b) return predictionUnavailable({contestId, target, model: 'spatial', reason: 'A neighbor pair names a place that is not in the file.'});
    edges.add(edgeKey(a, b));
  }
  const values = [...named.values()];
  if (named.size < 3 || !edges.size) return predictionUnavailable({contestId, target, model: 'spatial', reason: 'Moran\'s I needs at least three places and one neighbor pair.'});
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const deviation = new Map([...named].map(([name, value]) => [name, value - mean]));
  const squareSum = [...deviation.values()].reduce((sum, v) => sum + v * v, 0);
  if (squareSum === 0) return predictionUnavailable({contestId, target, model: 'spatial', reason: 'The places have no variation.'});
  let crossed = 0;
  for (const edge of edges) {
    const [a, b] = edge.split('\0');
    crossed += 2 * deviation.get(a) * deviation.get(b);
  }
  const weightSum = edges.size * 2;
  const estimate = (named.size / weightSum) * (crossed / squareSum);
  return modeled('spatial', contestId, target, {estimate, interval: null, places: named.size, pairs: edges.size});
}

export const plannedPredictionCatalog = [
  {model: 'historical-baseline', label: 'Historical baseline', status: 'planned', requirement: 'Comparable prior contests by position, district and geography vintage.', help: 'Start here. Compare this contest with compatible past contests and get a baseline range.'},
  {model: 'remaining-vote-beta', label: 'Remaining-vote beta model', status: 'blocked', requirement: 'Timestamped snapshots plus a separately estimated remaining-vote distribution.', help: 'Use during reporting when you have a defensible estimate of how many votes remain.'},
  {model: 'dirichlet-multinomial', label: 'All-choice count model', status: 'blocked', requirement: 'All-choice observations and a validated remaining-valid-vote estimate.', help: 'Use when you have every choice in the contest and the remaining vote pool.'},
  {model: 'kalman', label: 'Kalman time series', status: 'planned', requirement: 'A defined latent state and timestamped observation process.', help: 'Smooths a time series of observed shares. Enter one share per reporting drop.'},
  {model: 'markov-regime', label: 'Markov regimes', status: 'planned', requirement: 'Evidence for regimes and an evaluated transition model.', help: 'Explores movement between named states such as tight and wide.'},
  {model: 'spatial', label: 'Spatial model', status: 'planned', requirement: 'Boundary-versioned geographic relationships and assumptions.', help: 'Compares geographic areas when you can provide their neighbor relationships.'}
];
