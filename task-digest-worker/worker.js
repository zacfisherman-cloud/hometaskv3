// task-digest-worker — daily 7:30am (Melbourne) email digest of the household
// task list: what's overdue, what's due today, whose turn. Plain text on
// purpose — a readable rundown, not a template system.
//
// Cron fires at 20:30 AND 21:30 UTC; exactly one of those is 07:30 in
// Australia/Melbourne depending on DST, and the other is skipped by the
// local-hour check below, so the digest lands at 7:30 year-round.
//
// Firestore: the app's rules allow any Firebase-authenticated request, so the
// worker signs in anonymously with the public web API key (same as the app)
// and reads households/home over REST. No service account needed.
//
// Email: Brevo transactional API (free tier, no card). Requires two one-time
// setup steps in the Brevo dashboard + one secret:
//   1. create a free Brevo account and verify SENDER_EMAIL as a sender
//   2. get an API key (SMTP & API → API keys)
//   3. cd task-digest-worker && npx wrangler secret put BREVO_API_KEY
// Until the secret exists the worker logs and does nothing.

const FIREBASE_API_KEY = 'AIzaSyA_ppt9Y5S4qqvb4Jr3unzvecxE9Pjg5QI';
const FIRESTORE_DOC = 'https://firestore.googleapis.com/v1/projects/home-app-d73bc/databases/(default)/documents/households/home';
const APP_URL = 'https://home-app-d73bc.web.app';
const SENDER_EMAIL = 'zacfisherman@gmail.com'; // must be a verified Brevo sender
const SENDER_NAME = 'Home Tasks';
const TZ = 'Australia/Melbourne';

function melbourneNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long',
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10),
    weekday: get('weekday'),
  };
}

function decode(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = decode(x);
    return o;
  }
  return null;
}

async function readHousehold() {
  const auth = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  ).then(r => r.json());
  if (!auth.idToken) throw new Error('anonymous auth failed');
  const doc = await fetch(FIRESTORE_DOC, {
    headers: { Authorization: `Bearer ${auth.idToken}` },
  }).then(r => r.json());
  if (!doc.fields) throw new Error('household doc read failed');
  const S = {};
  for (const [k, v] of Object.entries(doc.fields)) S[k] = decode(v);
  return S;
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

// Mirrors the app: 'Both' tasks rotate via nextTurn ('name1'|'name2').
function whoLine(task, S) {
  if (task.assignee === 'Both') {
    const turn = task.nextTurn === 'name2' ? S.name2 : task.nextTurn === 'name1' ? S.name1 : null;
    return turn ? `${turn}'s turn` : 'Both';
  }
  return task.assignee || '';
}

function buildDigest(S, today) {
  const tasks = S.tasks || [];
  const overdue = tasks.filter(t => t.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = tasks.filter(t => t.dueDate === today);
  if (!overdue.length && !dueToday.length) return null;

  // Monday-start week window, matching the app's weekProgress
  const d = new Date(today + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
  const ws = d.toISOString().split('T')[0];
  const we = new Date(d); we.setUTCDate(we.getUTCDate() + 6);
  const weS = we.toISOString().split('T')[0];
  const log = (S.completedLog || []).filter(l => l.completedAt >= ws && l.completedAt <= weS);
  const doneIds = new Set(log.map(l => l.taskId));
  const pending = tasks.filter(t => t.dueDate >= ws && t.dueDate <= weS && !doneIds.has(t.id)).length;
  const total = log.length + pending;

  const lines = [];
  lines.push(`Good morning! Here's the rundown for ${new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}.`);
  lines.push('');
  if (overdue.length) {
    lines.push(`OVERDUE (${overdue.length})`);
    for (const t of overdue) {
      const n = daysBetween(t.dueDate, today);
      lines.push(`  • ${t.name} — ${whoLine(t, S)} — ${n === 1 ? '1 day' : n + ' days'} overdue`);
    }
    lines.push('');
  }
  if (dueToday.length) {
    lines.push(`DUE TODAY (${dueToday.length})`);
    for (const t of dueToday) lines.push(`  • ${t.name} — ${whoLine(t, S)}`);
    lines.push('');
  }
  lines.push(total ? `This week: ${log.length} of ${total} done (${Math.round(log.length / total * 100)}%).` : 'Nothing scheduled this week yet.');
  lines.push('');
  lines.push(`Open the app: ${APP_URL}`);
  return lines.join('\n');
}

async function sendDigest(env, S, text, today) {
  const to = [S.email1, S.email2]
    .map(e => (e || '').trim())
    .filter((e, i, a) => e.includes('@') && a.indexOf(e) === i)
    .map(email => ({ email }));
  if (!to.length) return { skipped: 'no recipient emails set in the app (Settings → Edit names)' };
  if (!env.BREVO_API_KEY) return { skipped: 'BREVO_API_KEY secret not set — run: npx wrangler secret put BREVO_API_KEY' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to,
      subject: `Home Tasks — ${text.includes('OVERDUE') ? 'overdue tasks need a look' : 'today\'s tasks'} (${today})`,
      textContent: text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Brevo send failed ${res.status}: ${body.slice(0, 300)}`);
  return { sent: to.map(t => t.email) };
}

export default {
  async scheduled(event, env, ctx) {
    const now = melbourneNow();
    // Two UTC crons; only the one that is 7am-something in Melbourne proceeds.
    if (now.hour !== 7) return;
    const S = await readHousehold();
    const text = buildDigest(S, now.date);
    if (!text) { console.log('digest: nothing due or overdue — no email'); return; }
    const result = await sendDigest(env, S, text, now.date);
    console.log('digest:', JSON.stringify(result));
  },

  // Manual check: /preview renders today's digest text without sending.
  // /run?token=<RUN_TOKEN> sends it for real (for testing the pipeline).
  async fetch(request, env) {
    const url = new URL(request.url);
    const now = melbourneNow();
    if (url.pathname === '/preview') {
      const S = await readHousehold();
      const text = buildDigest(S, now.date) || '(nothing due or overdue today — digest would be skipped)';
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (url.pathname === '/run') {
      if (!env.RUN_TOKEN || url.searchParams.get('token') !== env.RUN_TOKEN) {
        return new Response('forbidden', { status: 403 });
      }
      const S = await readHousehold();
      const text = buildDigest(S, now.date);
      if (!text) return new Response('nothing due or overdue — skipped', { status: 200 });
      const result = await sendDigest(env, S, text, now.date);
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('task-digest-worker: GET /preview or /run?token=…', { status: 200 });
  },
};
