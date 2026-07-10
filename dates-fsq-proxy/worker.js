/**
 * Cloudflare Worker — Foursquare proxy for the Date Night tab
 * (same pattern as lunch-fsq-proxy / meal-prep-proxy: CORS on our own
 * response, OPTIONS handled directly, key via wrangler secret, clean
 * JSON errors relayed to the app)
 *
 * Env var required (set via `wrangler secret put FSQ_SERVICE_KEY`):
 *   FSQ_SERVICE_KEY — Foursquare Service API Key from Developer Console
 *
 * Routes (all GET):
 *   /search?q=<text>&lat=&lon=      — text search with location bias
 *   /discover?lat=&lon=[&limit=]    — no-query discovery, sorted by rating
 *   /geocode?q=<suburb or postcode> — resolve to coords via Foursquare's
 *                                     own `near` geocoder (no third party)
 *   OPTIONS *                       — CORS preflight
 *
 * Category scope: the two top-level taxonomy groups so coverage matches
 * what Foursquare actually supports (descendants are included
 * automatically) — verified live against the 2025-06-17 API:
 *   4d4b7105d754a06374d81259  Dining and Drinking (restaurants, bars, cafés)
 *   4d4b7104d754a06370d81259  Arts and Entertainment (museums, galleries,
 *                             theatres, historic sites, aquariums, …)
 *
 * Rating economics: `rating` is a Pro-tier field. Each request tries to
 * include it; if the org is out of Pro credits (FSQ replies 429/402 with a
 * credits message) the request is retried with core fields only and the
 * response carries ratingUnavailable:true. Photos are Premium-tier and are
 * never requested.
 */

const FSQ_SEARCH = 'https://places-api.foursquare.com/places/search';
const FSQ_VERSION = '2025-06-17';

const CAT_DATE_SPOTS = '4d4b7105d754a06374d81259,4d4b7104d754a06370d81259';
const FIELDS_CORE = 'fsq_place_id,name,categories,location';
const FIELDS_PRO  = FIELDS_CORE + ',rating';

const ALLOWED_ORIGIN = '*';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function jsonError(status, message, upstreamBody) {
  const payload = { error: message };
  if (upstreamBody) payload.detail = upstreamBody;
  return json(status, payload);
}

async function fsqFetch(env, params) {
  const fsqUrl = new URL(FSQ_SEARCH);
  Object.entries(params).forEach(([k, v]) => fsqUrl.searchParams.set(k, v));
  const res = await fetch(fsqUrl.toString(), {
    headers: {
      Authorization:          `Bearer ${env.FSQ_SERVICE_KEY}`,
      'X-Places-Api-Version': FSQ_VERSION,
      Accept:                 'application/json',
    },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

function isCreditsError(r) {
  return (r.status === 429 || r.status === 402) && /credit/i.test(r.text);
}

// Try with the Pro rating field; fall back to core fields when the org has
// no Pro credits left so search/discover keep working (just unrated).
async function fsqSearchWithRating(env, params) {
  let r = await fsqFetch(env, { ...params, fields: FIELDS_PRO });
  if (isCreditsError(r)) {
    r = await fsqFetch(env, { ...params, fields: FIELDS_CORE });
    return { ...r, ratingUnavailable: true };
  }
  return { ...r, ratingUnavailable: false };
}

function relayError(r) {
  const msg =
    r.status === 401 ? 'Foursquare key invalid or expired — check Service API Key in Developer Console' :
    r.status === 402 || r.status === 429 ? (/credit/i.test(r.text)
      ? 'Foursquare account has no API credits — add credits in the Developer Console billing page'
      : 'Foursquare rate limit hit — slow down') :
    `Foursquare error ${r.status}`;
  return jsonError(r.status, msg, r.text.slice(0, 500));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return jsonError(405, 'Method not allowed');
    }
    if (!env.FSQ_SERVICE_KEY) {
      return jsonError(500, 'FSQ_SERVICE_KEY secret is not set on this Worker');
    }

    // ── /search: text query + location bias ────────────────────────────
    if (url.pathname === '/search') {
      const q   = (url.searchParams.get('q') || '').trim();
      const lat = parseFloat(url.searchParams.get('lat'));
      const lon = parseFloat(url.searchParams.get('lon'));
      if (q.length < 2)                  return jsonError(400, 'q must be at least 2 characters');
      if (!isFinite(lat) || !isFinite(lon)) return jsonError(400, 'lat and lon are required numbers');
      let r;
      try {
        r = await fsqSearchWithRating(env, {
          query: q, ll: `${lat},${lon}`, radius: 8000,
          fsq_category_ids: CAT_DATE_SPOTS, limit: 10, sort: 'RELEVANCE',
        });
      } catch (e) { return jsonError(502, `Upstream fetch failed: ${e.message}`); }
      if (!r.ok) return relayError(r);
      const data = JSON.parse(r.text);
      return json(200, { results: data.results || [], ratingUnavailable: r.ratingUnavailable });
    }

    // ── /discover: no query, best-rated date spots near the bias ───────
    if (url.pathname === '/discover') {
      const lat = parseFloat(url.searchParams.get('lat'));
      const lon = parseFloat(url.searchParams.get('lon'));
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 30, 50);
      if (!isFinite(lat) || !isFinite(lon)) return jsonError(400, 'lat and lon are required numbers');
      let r;
      try {
        r = await fsqSearchWithRating(env, {
          ll: `${lat},${lon}`, radius: 6000,
          fsq_category_ids: CAT_DATE_SPOTS, limit, sort: 'RATING',
        });
      } catch (e) { return jsonError(502, `Upstream fetch failed: ${e.message}`); }
      if (!r.ok) return relayError(r);
      const data = JSON.parse(r.text);
      return json(200, { results: data.results || [], ratingUnavailable: r.ratingUnavailable });
    }

    // ── /geocode: suburb/postcode → coords via Foursquare's own `near` ──
    // A near-biased 1-result core search returns the geocoded centre in
    // context.geo_bounds.circle.center — Foursquare's own location
    // resolution, so no third-party geocoder is needed.
    if (url.pathname === '/geocode') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return jsonError(400, 'q is required');
      let r;
      try {
        r = await fsqFetch(env, {
          near: `${q}, VIC, Australia`, limit: 1, fields: 'fsq_place_id',
          fsq_category_ids: CAT_DATE_SPOTS,
        });
      } catch (e) { return jsonError(502, `Upstream fetch failed: ${e.message}`); }
      if (!r.ok) return relayError(r);
      const data = JSON.parse(r.text);
      const c = data.context?.geo_bounds?.circle?.center;
      if (!c || typeof c.latitude !== 'number') return jsonError(404, `Couldn't place "${q}" — try a nearby suburb`);
      return json(200, { lat: c.latitude, lon: c.longitude });
    }

    return jsonError(404, 'Not found — use /search, /discover or /geocode');
  },
};
