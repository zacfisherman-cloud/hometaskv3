/**
 * Cloudflare Worker — Meal Prep AI proxy (Workers AI, free tier)
 *
 * Same pattern as lunch-fsq-proxy: CORS on every response, OPTIONS handled
 * directly, clean JSON errors relayed to the app. No secrets required —
 * the AI binding is configured in wrangler.toml.
 *
 * Routes:
 *   POST /parse    { text, existingProteins: [] }
 *                  → { recipe: {name, protein, proteinIsNew, serves, minutes,
 *                               ingredients:[{qty,unit,item}], steps:[]},
 *                      via: "ai" | "ai-retry" | "heuristic" }
 *   POST /fetch       { url }
 *                     → { text, via: "jsonld" | "html", title? }
 *   POST /parse-image { imageBase64, existingProteins: [] }
 *                     → same shape as /parse (vision transcription piped
 *                       through the exact same structuring pipeline)
 *   POST /suggest     { styleName, proteins: [], existingRecipeNames: [] }
 *                     → { recipes: [{name, protein, serves, minutes, summary,
 *                                    ingredients:[{qty,unit,item}], steps:[]}] }
 *   OPTIONS *         — CORS preflight
 *
 * Text model: llama-3.3-70b-instruct-fp8-fast — the 3.1-8b base model was
 * deprecated by Cloudflare on 2026-05-30 (caught in live testing); the 70b
 * fp8-fast build has far better strict-JSON discipline and still fits the
 * free daily allocation comfortably for a two-person household.
 * Vision model (/parse-image only): llava-1.5-7b-hf — image captioning, not
 * OCR; used only to get rough text off a photo, structured by the same
 * pipeline as pasted text (see handleParseImage).
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Lock this down to the GitHub Pages origin once confirmed, e.g.
// 'https://zacfisherman-cloud.github.io'
const ALLOWED_ORIGIN = '*';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
function jsonError(status, message) { return json(status, { error: message }); }

/* ── strict-JSON plumbing for an open model ─────────────────────────────
   Llama is decent but not Claude-grade at JSON discipline: it fences code
   blocks, adds prose, or trails commas. Extract the outermost object, try
   to parse, and let callers retry once with a sterner prompt before any
   fallback. */
function extractJSON(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let candidate = text.slice(start, end + 1);
  // common llama slip: trailing commas before } or ]
  candidate = candidate.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(candidate); } catch { return null; }
}

// Different Workers AI model generations return different envelope shapes
// (legacy {response:"..."}, OpenAI-style {choices:[{message:{content}}]},
// or a pre-parsed object). Caught live: llama-3.3-70b doesn't use the
// legacy shape. Handle them all, preferring structured payloads.
function extractText(res) {
  if (typeof res === 'string') return res;
  if (res && typeof res.response === 'object' && res.response !== null) return JSON.stringify(res.response);
  if (typeof res?.response === 'string') return res.response;
  const choice = res?.choices?.[0];
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  if (typeof choice?.text === 'string') return choice.text;
  if (typeof res?.output_text === 'string') return res.output_text;
  return JSON.stringify(res ?? '');
}

async function askModel(env, system, user, maxTokens) {
  const res = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.4,
  });
  return extractText(res);
}

// Ask → parse → on malformed JSON, re-ask once with a sterner instruction.
async function askForJSON(env, system, user, maxTokens) {
  let raw = await askModel(env, system, user, maxTokens);
  let obj = extractJSON(raw);
  if (obj) return { obj, via: 'ai' };
  raw = await askModel(
    env,
    system + ' CRITICAL: respond with ONLY a raw JSON object. No markdown fences, no commentary, no text before or after the JSON.',
    user, maxTokens
  );
  obj = extractJSON(raw);
  if (obj) return { obj, via: 'ai-retry' };
  return { obj: null, via: null };
}

/* ── sanitizers: never trust model output shape ─────────────────────── */
const str = (v, cap) => typeof v === 'string' ? v.trim().slice(0, cap) : '';
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};
function sanitizeIngredients(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 40).map(i => {
    if (typeof i === 'string') return { qty: null, unit: null, item: str(i, 120) };
    return {
      qty: (() => { const n = Number(i?.qty); return Number.isFinite(n) && n > 0 && n < 100000 ? n : null; })(),
      unit: str(i?.unit, 20) || null,
      item: str(i?.item, 120),
    };
  }).filter(i => i.item);
}
function sanitizeSteps(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 20).map(s => str(s, 500)).filter(Boolean);
}

// Canonical protein key: lowercase, collapsed whitespace, last word
// singularized — so "Lentils"/"lentil" and "chicken thighs"/"Chicken thigh"
// all collide into one option. Mirrored client-side.
function normalizeProtein(s) {
  let t = (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}

/* ── heuristic fallback for /parse (model failed twice) ─────────────── */
function heuristicParse(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const name = str(lines[0] || 'Pasted recipe', 90);
  const qtyRe = /^[\s]*([\d¼½¾/.,]+)\s*(g|kg|ml|l|tbsp|tsp|cup|cups|bunch|clove|cloves|head|heads|can|cans|slice|slices|piece|pieces)?\b\s*(.+)$/i;
  const ingredients = [];
  const steps = [];
  let inSteps = false;
  for (const line of lines.slice(1)) {
    if (/^(method|steps|instructions|directions)\b/i.test(line)) { inSteps = true; continue; }
    if (/^(ingredients)\b/i.test(line)) { inSteps = false; continue; }
    if (inSteps || /^\d+[.)]\s/.test(line)) {
      steps.push(str(line.replace(/^\d+[.)]\s*/, ''), 500));
      continue;
    }
    const m = line.match(qtyRe);
    if (m && m[3] && ingredients.length < 40) {
      const qty = parseFloat(String(m[1]).replace(',', '.').replace('¼', '0.25').replace('½', '0.5').replace('¾', '0.75'));
      ingredients.push({ qty: Number.isFinite(qty) ? qty : null, unit: m[2] ? m[2].toLowerCase() : null, item: str(m[3], 120) });
    }
  }
  return { name, protein: '', serves: null, minutes: null, ingredients, steps: steps.slice(0, 20) };
}

/* ── /fetch: pull a recipe page server-side and extract its text ────
   JSON-LD (schema.org Recipe) first — most recipe sites embed it and it
   is far more reliable than scraping markup; falls back to stripping the
   HTML to visible text. Paywalls/JS-only sites return a clear 422 so the
   app can tell the user to paste instead. */
function decodeEntities(t){
  return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ');
}
function findRecipeNode(node){
  if(!node || typeof node !== 'object') return null;
  if(Array.isArray(node)){ for(const n of node){ const r = findRecipeNode(n); if(r) return r; } return null; }
  const t = node['@type'];
  if(t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  if(node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}
function instructionsToLines(ins){
  if(!ins) return [];
  if(typeof ins === 'string') return ins.split(/\n+/).map(x => x.trim()).filter(Boolean);
  if(!Array.isArray(ins)) ins = [ins];
  const out = [];
  for(const step of ins){
    if(typeof step === 'string'){ out.push(step.trim()); continue; }
    if(step && typeof step === 'object'){
      if(Array.isArray(step.itemListElement)) out.push(...instructionsToLines(step.itemListElement));
      else if(step.text) out.push(String(step.text).trim());
      else if(step.name) out.push(String(step.name).trim());
    }
  }
  return out.filter(Boolean);
}
function extractRecipeText(html){
  // 1) JSON-LD
  const ldBlocks = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for(const m of ldBlocks){
    let parsed;
    try{ parsed = JSON.parse(m[1].trim()); }catch{ continue; }
    const r = findRecipeNode(parsed);
    if(!r) continue;
    const name = typeof r.name === 'string' ? r.name.trim() : 'Recipe';
    const ings = Array.isArray(r.recipeIngredient) ? r.recipeIngredient.map(x => String(x).trim()).filter(Boolean) : [];
    const steps = instructionsToLines(r.recipeInstructions);
    if(ings.length || steps.length){
      const lines = [name, ''];
      if(r.recipeYield) lines.push(`Serves ${Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield}`);
      lines.push('', 'Ingredients', ...ings, '', 'Method', ...steps.map((x,i)=>`${i+1}. ${x}`));
      return { text: decodeEntities(lines.join('\n')).slice(0, 8000), via: 'jsonld', title: name };
    }
  }
  // 2) visible-text fallback
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t).replace(/[ \t]+/g, ' ').replace(/\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if(t.length < 200) return null;
  return { text: t.slice(0, 8000), via: 'html', title: null };
}
async function handleFetch(env, body){
  const url = str(body?.url, 500);
  if(!/^https?:\/\//i.test(url)) return jsonError(400, 'url must start with http(s)://');
  let res;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try{
    res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
      },
    });
  }catch(e){
    return jsonError(422, e.name === 'AbortError' ? 'That site took too long to respond' : `Couldn't reach that site: ${e.message}`);
  }finally{ clearTimeout(timeoutId); }
  if(!res.ok) return jsonError(422, `That site answered ${res.status} — it may be blocking robots or behind a login`);
  const ctype = res.headers.get('content-type') || '';
  if(!/text\/html|application\/xhtml/.test(ctype)) return jsonError(422, `That link isn't a web page (${ctype.split(';')[0] || 'unknown type'})`);
  const html = (await res.text()).slice(0, 800000);
  const out = extractRecipeText(html);
  if(!out) return jsonError(422, "Couldn't find readable recipe text on that page — it may need JavaScript or a login");
  return json(200, out);
}

/* ── endpoint handlers ─────────────────────────────────────────────── */
async function handleParse(env, body) {
  const text = str(body?.text, 8000);
  if (!text || text.length < 20) return jsonError(400, 'Paste at least a few lines of recipe text');
  const existing = Array.isArray(body?.existingProteins) ? body.existingProteins.slice(0, 40).map(p => str(p, 40)).filter(Boolean) : [];

  const system = 'You turn pasted recipe text into structured JSON. Respond with only a JSON object, no other text.';
  const user = `Existing protein tags (reuse one of these EXACTLY, including its casing, if the recipe's main protein matches; only invent a new short tag if none fits):
${existing.join(', ') || '(none yet)'}

Recipe text:
"""
${text}
"""

Return JSON with exactly this shape:
{"name":"...","protein":"...","serves":4,"minutes":30,"ingredients":[{"qty":500,"unit":"g","item":"chicken thigh"}],"steps":["..."]}
Rules: protein is the single main protein tag. qty is a plain number or null (convert fractions like 1/2 to decimals). unit is one of g, kg, ml, l, cup, tbsp, tsp, clove, can, bunch, head, slice, piece, pack — or null if the ingredient has no unit. serves/minutes numbers or null if not stated. Keep ingredient items short: the item is the food name only, never quantities or units inside it.`;

  const { obj, via } = await askForJSON(env, system, user, 1600);
  let recipe, source;
  if (obj) {
    recipe = {
      name: str(obj.name, 90) || 'Pasted recipe',
      protein: str(obj.protein, 40),
      serves: num(obj.serves, 1, 24),
      minutes: num(obj.minutes, 1, 24 * 60),
      ingredients: sanitizeIngredients(obj.ingredients),
      steps: sanitizeSteps(obj.steps),
    };
    source = via;
  } else {
    recipe = heuristicParse(text);
    source = 'heuristic';
  }
  if (!recipe.ingredients.length && source !== 'heuristic') {
    // model returned JSON but lost the ingredients — heuristic rescues them
    const h = heuristicParse(text);
    if (h.ingredients.length) recipe.ingredients = h.ingredients;
    if (!recipe.steps.length) recipe.steps = h.steps;
  }
  const key = normalizeProtein(recipe.protein);
  const match = existing.find(p => normalizeProtein(p) === key);
  if (match) recipe.protein = match; // snap to the existing tag's exact display form
  const proteinIsNew = !!key && !match;
  return json(200, { recipe: { ...recipe, proteinIsNew }, via: source });
}

/* ── /parse-image: photo → rough text transcription → same /parse pipeline ──
   llava-1.5-7b-hf is a captioning model, not an OCR engine — it paraphrases
   more than it literally transcribes, so this is honestly a rougher starting
   point than pasted text. It only does ONE job (get *some* text off the
   photo); the proven /parse structuring logic (retry, sanitizers, heuristic
   fallback) does the rest, and the same review-before-save sheet every other
   entry path uses is where a human catches whatever the model missed. */
async function handleParseImage(env, body) {
  const imageBase64 = str(body?.imageBase64, 15000000);
  if (!imageBase64) return jsonError(400, 'No image provided');
  const existing = Array.isArray(body?.existingProteins) ? body.existingProteins.slice(0, 40).map(p => str(p, 40)).filter(Boolean) : [];

  let bytes;
  try {
    const b64 = imageBase64.replace(/^data:[^,]+,/, '');
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) {
    return jsonError(400, 'Image data could not be decoded');
  }
  if (bytes.length > 11000000) return jsonError(413, 'Photo is too large — try a smaller or less detailed shot');

  // NOTE (live-tested 2026-07-13): llama-3.2-11b-vision-instruct is
  // instruction-tuned and would very likely transcribe far more accurately
  // than a pure captioner, but Workers AI gates it behind a one-time Meta
  // license acceptance tied to the Cloudflare account (send {prompt:"agree"}
  // to it once — see model docs). That's a legal acceptance on the account
  // owner's behalf, not something to do automatically. If accepted later,
  // swap the model call below to the messages format and this endpoint's
  // transcription quality should improve substantially.
  let caption;
  try {
    const res = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: [...bytes],
      prompt: 'Transcribe every word of readable text in this recipe photo exactly as written: the title, every ingredient with its exact quantity, and every numbered step. Do not summarize or paraphrase — copy the text verbatim, line by line.',
      max_tokens: 1024,
    });
    caption = typeof res?.description === 'string' ? res.description : '';
  } catch (e) {
    return jsonError(502, `Photo transcription failed: ${e.message}`);
  }
  if (!caption || caption.trim().length < 20) {
    return jsonError(422, "Couldn't read enough text from that photo — try a clearer, closer shot, or paste the text instead");
  }
  return await handleParse(env, { text: caption, existingProteins: existing });
}

async function handleSuggest(env, body) {
  const styleName = str(body?.styleName, 60) || 'weeknight meal prep';
  const proteins = Array.isArray(body?.proteins) ? body.proteins.slice(0, 3).map(p => str(p, 40)).filter(Boolean) : [];
  if (!proteins.length) return jsonError(400, 'Pick at least one protein first');
  const avoid = Array.isArray(body?.existingRecipeNames) ? body.existingRecipeNames.slice(0, 30).map(n => str(n, 90)).filter(Boolean) : [];

  const system = 'You suggest meal-prep recipes as structured JSON. Respond with only a JSON object, no other text.';
  const user = `Suggest exactly 3 distinct dinner recipes for two people doing "${styleName}" style meal prep.
HARD CONSTRAINT: every recipe's main protein MUST be one of: ${proteins.join(', ')} — no other proteins are allowed as the main protein. Use the tag exactly as written. ${proteins.length === 1 ? 'Since only one protein is given, all 3 recipes use it — vary the cuisine and technique instead.' : 'Cover different proteins from the list where possible.'}
Use plenty of varied vegetables — any vegetables you like.
Do NOT suggest anything with these names (already in their cookbook): ${avoid.join('; ') || '(none)'}

Return JSON with exactly this shape:
{"recipes":[{"name":"...","protein":"...","serves":4,"minutes":30,"summary":"one appetising sentence","ingredients":[{"qty":500,"unit":"g","item":"chicken thigh"}],"steps":["..."]}]}
Rules: 6-10 ingredients each with numeric qty (or null, fractions as decimals) and unit one of g, kg, ml, l, cup, tbsp, tsp, clove, can, bunch, head, slice, piece, pack — or null. The item field is the food name only, never quantities or units inside it. 4-6 concise steps each. Keep names short and appealing.`;

  const { obj } = await askForJSON(env, system, user, 2400);
  if (!obj || !Array.isArray(obj.recipes)) {
    return jsonError(502, 'The suggestion model returned an unusable response — try again');
  }
  const allowedKeys = proteins.map(normalizeProtein);
  const recipes = obj.recipes.slice(0, 3).map(r => {
    // snap to the caller's tag when the model matched but re-cased/pluralized;
    // recipes on a protein OUTSIDE the requested list are dropped below —
    // caught live: asked for beef mince only, got lentil + chickpea recipes.
    const i = allowedKeys.indexOf(normalizeProtein(str(r?.protein, 40)));
    return {
      name: str(r?.name, 90),
      protein: i >= 0 ? proteins[i] : null,
      serves: num(r?.serves, 1, 24) || 4,
      minutes: num(r?.minutes, 1, 24 * 60),
      summary: str(r?.summary, 200),
      ingredients: sanitizeIngredients(r?.ingredients),
      steps: sanitizeSteps(r?.steps),
    };
  }).filter(r => r.name && r.protein && r.ingredients.length >= 3);
  if (!recipes.length) return jsonError(502, 'The suggestion model returned no usable recipes — try again');
  return json(200, { recipes });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') return jsonError(405, 'Method not allowed — POST /parse or /suggest');
    let body;
    try { body = await request.json(); } catch { return jsonError(400, 'Body must be JSON'); }
    const path = new URL(request.url).pathname;
    try {
      if (path === '/fetch')       return await handleFetch(env, body);
      if (path === '/parse')       return await handleParse(env, body);
      if (path === '/parse-image') return await handleParseImage(env, body);
      if (path === '/suggest')     return await handleSuggest(env, body);
      return jsonError(404, 'Not found — use /fetch, /parse, /parse-image or /suggest');
    } catch (e) {
      return jsonError(502, `Workers AI call failed: ${e.message}`);
    }
  },
};
