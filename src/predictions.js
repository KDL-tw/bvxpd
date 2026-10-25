// Prediction records are deliberately separate from observed and demo snapshots.
// No estimator writes a result yet; this contract prevents a future forecast from
// being mistaken for a count imported from an official source.
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

export const plannedPredictionCatalog = [
  {model: 'historical-baseline', label: 'Historical baseline', status: 'planned', requirement: 'Comparable prior contests by position, district and geography vintage.'},
  {model: 'remaining-vote-beta', label: 'Remaining-vote beta model', status: 'blocked', requirement: 'Timestamped snapshots plus a separately estimated remaining-vote distribution.'},
  {model: 'dirichlet-multinomial', label: 'All-choice count model', status: 'blocked', requirement: 'All-choice observations and a validated remaining-valid-vote estimate.'},
  {model: 'kalman', label: 'Kalman time series', status: 'planned', requirement: 'A defined latent state and timestamped observation process.'},
  {model: 'markov-regime', label: 'Markov regimes', status: 'planned', requirement: 'Evidence for regimes and an evaluated transition model.'},
  {model: 'spatial', label: 'Spatial model', status: 'planned', requirement: 'Boundary-versioned geographic relationships and assumptions.'}
];
