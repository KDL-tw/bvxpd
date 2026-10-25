// Vercel serverless proxy. Set LIVE_RESULTS_URL to an approved JSON feed.
export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({error: 'GET only'});
  const upstream = process.env.LIVE_RESULTS_URL;
  if (!upstream) return response.status(503).json({error: 'Live feed is not configured', code: 'LIVE_FEED_NOT_CONFIGURED'});
  try {
    const result = await fetch(upstream, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(10000)});
    if (!result.ok) throw new Error(`Upstream returned ${result.status}`);
    const payload = await result.json();
    const records = Array.isArray(payload) ? payload : payload.records || payload.results;
    if (!Array.isArray(records)) throw new Error('Feed must return an array or {records/results: []}');
    return response.status(200).json({schemaVersion: 1, kind: 'live', fetchedAt: new Date().toISOString(), records});
  } catch (error) {
    return response.status(502).json({error: 'Live feed unavailable', detail: error.message});
  }
}
