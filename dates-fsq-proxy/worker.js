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
 *   /search?q=<text>&lat=&lon=      — text search with location bias; a
 *                                     parallel rating-sorted probe of the
 *                                     same query marks its top hits
 *                                     highlyRated:true (a free qualitative
 *                                     signal — the numeric rating field is
 *                                     Pro-gated but server-side rating
 *                                     ORDER is not)
 *   /discover?lat=&lon=[&limit=][&sort=RATING|POPULARITY]
 *                                   — no-query discovery; both sorts are
 *                                     free server-side orderings
 *   /geocode?q=<suburb or postcode> — resolve to coords via Foursquare's
 *                                     own `near` geocoder (no third party)
 *   OPTIONS *                       — CORS preflight
 *
 * Category scope: Dining and Drinking in full, plus hand-picked
 * date-worthy Arts subcategories (descendants included automatically) —
 * the full Arts and Entertainment top level also matches stadiums, war
 * memorials and monuments, which are not date suggestions. All IDs
 * verified live against the 2025-06-17 API:
 *   4d4b7105d754a06374d81259  Dining and Drinking (restaurants, bars, cafés)
 *   4bf58dd8d48988d1e2931735  Art Gallery
 *   4bf58dd8d48988d181941735  Museum (art/history/science…)
 *   4bf58dd8d48988d1f2931735  Performing Arts Venue (theatres, concert halls, opera)
 *   4bf58dd8d48988d1e5931735  Music Venue (live music)
 *   4bf58dd8d48988d18e941735  Comedy Club
 *   4bf58dd8d48988d17f941735  Movie Theater
 *   4fceea171983d5d06c3e9823  Aquarium
 *   4bf58dd8d48988d17b941735  Zoo
 * Discover additionally drops any result carrying a memorial / monument /
 * cemetery / stadium category, because solemn or sports venues can still
 * ride in through a second category (the Shrine of Remembrance matches
 * "History Museum" while also being a Memorial Site). Manual /search is
 * not deny-filtered — a typed query is explicit intent.
 *
 * Rating economics: `rating` is a Pro-tier field. Each request tries to
 * include it; if the org is out of Pro credits (FSQ replies 429/402 with a
 * credits message) the request is retried with core fields only and the
 * response carries ratingUnavailable:true. Photos are Premium-tier and are
 * never requested.
 */

const FSQ_SEARCH = 'https://places-api.foursquare.com/places/search';
const FSQ_VERSION = '2025-06-17';

const CAT_FOOD = '4d4b7105d754a06374d81259'; // Dining and Drinking (whole group)
const CAT_EXPERIENCES = [
  '4bf58dd8d48988d1e2931735', // Art Gallery
  '4bf58dd8d48988d181941735', // Museum
  '4bf58dd8d48988d1f2931735', // Performing Arts Venue
  '4bf58dd8d48988d1e5931735', // Music Venue
  '4bf58dd8d48988d18e941735', // Comedy Club
  '4bf58dd8d48988d17f941735', // Movie Theater
  '4fceea171983d5d06c3e9823', // Aquarium
  '4bf58dd8d48988d17b941735', // Zoo
].join(',');
const CAT_DATE_SPOTS = CAT_FOOD + ',' + CAT_EXPERIENCES;
// /discover scope selector: food | experiences | both (default)
function scopeCategories(scope) {
  if (scope === 'food') return CAT_FOOD;
  if (scope === 'experiences') return CAT_EXPERIENCES;
  return CAT_DATE_SPOTS;
}
const NOT_A_DATE_SPOT = /memorial|monument|cemeter|stadium|sports/i;
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
      const base = { query: q, ll: `${lat},${lon}`, radius: 8000, fsq_category_ids: CAT_DATE_SPOTS };
      let r, rated;
      try {
        // Second, id-only probe of the same query sorted by rating: results
        // that also land in its top slice earn highlyRated (order is a real
        // rating signal even when the rating field itself is Pro-gated).
        [r, rated] = await Promise.all([
          fsqSearchWithRating(env, { ...base, limit: 10, sort: 'RELEVANCE' }),
          fsqFetch(env, { ...base, limit: 5, sort: 'RATING', fields: 'fsq_place_id' }).catch(() => null),
        ]);
      } catch (e) { return jsonError(502, `Upstream fetch failed: ${e.message}`); }
      if (!r.ok) return relayError(r);
      const data = JSON.parse(r.text);
      let topIds = new Set();
      if (rated && rated.ok) {
        try { topIds = new Set((JSON.parse(rated.text).results || []).map(p => p.fsq_place_id)); } catch (e) {}
      }
      const results = (data.results || []).map(p =>
        topIds.has(p.fsq_place_id) ? { ...p, highlyRated: true } : p);
      return json(200, { results, ratingUnavailable: r.ratingUnavailable });
    }

    // ── /discover: no query, best-rated date spots near the bias ───────
    if (url.pathname === '/discover') {
      const lat = parseFloat(url.searchParams.get('lat'));
      const lon = parseFloat(url.searchParams.get('lon'));
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 30, 50);
      // Both orderings are free server-side; the app offers them as
      // "Best rated" vs "Trending now".
      const sort = (url.searchParams.get('sort') || '').toUpperCase() === 'POPULARITY' ? 'POPULARITY' : 'RATING';
      const cats = scopeCategories(url.searchParams.get('scope'));
      if (!isFinite(lat) || !isFinite(lon)) return jsonError(400, 'lat and lon are required numbers');
      let r;
      try {
        r = await fsqSearchWithRating(env, {
          ll: `${lat},${lon}`, radius: 6000,
          fsq_category_ids: cats, limit, sort,
        });
      } catch (e) { return jsonError(502, `Upstream fetch failed: ${e.message}`); }
      if (!r.ok) return relayError(r);
      const data = JSON.parse(r.text);
      const results = (data.results || []).filter(p =>
        !(p.categories || []).some(c => NOT_A_DATE_SPOT.test(c?.name || '')));
      return json(200, { results, ratingUnavailable: r.ratingUnavailable });
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
