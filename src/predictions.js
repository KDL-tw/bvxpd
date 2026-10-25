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

export const plannedPredictionCatalog = [
  {model: 'historical-baseline', label: 'Historical baseline', status: 'planned', requirement: 'Comparable prior contests by position, district and geography vintage.'},
  {model: 'remaining-vote-beta', label: 'Remaining-vote beta model', status: 'blocked', requirement: 'Timestamped snapshots plus a separately estimated remaining-vote distribution.'},
  {model: 'dirichlet-multinomial', label: 'All-choice count model', status: 'blocked', requirement: 'All-choice observations and a validated remaining-valid-vote estimate.'},
  {model: 'kalman', label: 'Kalman time series', status: 'planned', requirement: 'A defined latent state and timestamped observation process.'},
  {model: 'markov-regime', label: 'Markov regimes', status: 'planned', requirement: 'Evidence for regimes and an evaluated transition model.'},
  {model: 'spatial', label: 'Spatial model', status: 'planned', requirement: 'Boundary-versioned geographic relationships and assumptions.'}
];
