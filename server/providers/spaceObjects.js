import { readResponseJsonCapped } from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';

// NASA/JPL Solar System Dynamics APIs (public, keyless): https://ssd-api.jpl.nasa.gov/doc/
const JPL = 'https://ssd-api.jpl.nasa.gov';
const TTL_MS = 3_600_000;
const ROUTES = {
  // Fireballs (bolides) detected by US Government sensors, newest first.
  '/fireballs': () => `${JPL}/fireball.api?limit=25`,
  // Asteroid and comet close approaches to Earth in the next 60 days (< 0.05 AU).
  '/approaches': () => `${JPL}/cad.api?dist-max=0.05&date-min=now&date-max=%2B60&sort=date&limit=30`,
  // One small body's orbit and physical parameters from the Small-Body Database.
  '/body': (query) => {
    const des = new URLSearchParams(query).get('des') ?? '';
    // A designation or name only: letters, digits, space, slash, dash, dot, parens.
    if (!/^[\w ./()-]{1,60}$/.test(des)) return null;
    return `${JPL}/sbdb.api?${new URLSearchParams({ sstr: des, 'phys-par': '1', discovery: '1' })}`;
  },
};

/** Fixed-origin NASA/JPL small-body routes for dev and preview. */
export function spaceObjectsProxy({ fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now() } = {}) {
  const cache = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 1200 });

  async function handler(req, res) {
    const json = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const [path, query = ''] = (req.url || '/').split('?');
    const build = ROUTES[path];
    if (!build) return json(404, { error: 'unknown_route' });
    const url = build(query);
    if (!url) return json(400, { error: 'bad_request' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    const hit = cache.get(url);
    if (hit && now() - hit.at < TTL_MS) return json(200, hit.value);
    try {
      const signal = AbortSignal.timeout(20_000);
      const response = await fetchImpl(url, { signal, redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        return json(response.status === 404 ? 404 : 502, { error: 'space_objects_unavailable' });
      }
      const value = await readResponseJsonCapped(response, 2 * 1024 * 1024, signal);
      if (cache.size > 200) cache.clear();
      cache.set(url, { value, at: now() });
      json(200, value);
    } catch {
      // A failed refresh serves the last answer, if any.
      json(hit ? 200 : 502, hit ? hit.value : { error: 'space_objects_unavailable' });
    }
  }

  return {
    name: 'space-objects',
    configureServer({ middlewares }) {
      middlewares.use('/api/space-objects', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/space-objects', handler);
    },
  };
}
