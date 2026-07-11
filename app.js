/* ════════════════════════════════════════ STATE & DEFAULTS */
firebase.initializeApp({
  apiKey:"AIzaSyA_ppt9Y5S4qqvb4Jr3unzvecxE9Pjg5QI",
  authDomain:"home-app-d73bc.firebaseapp.com",
  projectId:"home-app-d73bc",
  storageBucket:"home-app-d73bc.firebasestorage.app",
  messagingSenderId:"908678023697",
  appId:"1:908678023697:web:8901d89b70057144b23fb0"
});
const db = firebase.firestore();
const HOUSEHOLD = db.collection('households').doc('home');

let S = {};

const FREQ_DAYS = {daily:1, weekly:7, fortnightly:14, monthly:30};
const FREQ_LABELS = {daily:'Daily', weekly:'Weekly', fortnightly:'Fortnightly', monthly:'Monthly', custom:'Custom'};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const ROOM_CHIPS = [
  {name:'Kitchen',             icon:'utensils'},
  {name:'Bathroom (Living)',   icon:'droplets'},
  {name:'Bathroom (Bedroom)',  icon:'droplets'},
  {name:'Bedroom',             icon:'bed'},
  {name:'Study Nook',          icon:'monitor'},
  {name:'Garage',              icon:'warehouse'},
  {name:"Ella's Study Room",   icon:'book-open'},
  {name:'Living Room',         icon:'sofa'},
  {name:'Laundry',             icon:'washing-machine'},
  {name:'Outdoor',             icon:'sun'},
];

function uid(){ return Math.random().toString(36).slice(2,9); }
// Format a Date as YYYY-MM-DD in LOCAL time. toISOString() renders the UTC
// date — in Melbourne that's still *yesterday* until 10-11am, so "today"
// lagged a day every morning, and it silently shaved a day off every
// addDays() result (weekly reschedules landed +6 days, monthly +29).
function toLocalYMD(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr(){ return toLocalYMD(new Date()); }

// Escapes free-text user input before it's interpolated into innerHTML —
// covers text-node and double-quoted-attribute contexts alike.
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
}

function addDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n);
  return toLocalYMD(d);
}
function getWeekStart(d = new Date()){
  const day = d.getDay(), diff = d.getDate() - day + (day===0?-6:1);
  const m = new Date(d); m.setDate(diff); m.setHours(0,0,0,0);
  return toLocalYMD(m);
}
function weekLabel(ws){
  const s = new Date(ws+'T00:00:00'), e = new Date(s); e.setDate(e.getDate()+6);
  return `${MONTHS[s.getMonth()]} ${s.getDate()} — ${e.getDate()}`;
}
function greeting(){
  const h = new Date().getHours();
  return h<12 ? 'Good morning,' : h<17 ? 'Good afternoon,' : 'Good evening,';
}
function getFreqDays(task){
  if(task.frequency === 'custom') return task.customDays || 7;
  return FREQ_DAYS[task.frequency] || 7;
}
function freqLabel(task){
  if(task.frequency === 'custom') return `Every ${task.customDays||7} days`;
  return FREQ_LABELS[task.frequency] || 'Weekly';
}

function dayLabelFor(dateStr){
  const t = todayStr();
  if(dateStr === t) return 'Today';
  if(dateStr === addDays(t, 1)) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - new Date(t+'T00:00:00')) / 86400000);
  if(diff > 0 && diff < 7) return DAYS[d.getDay()];
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function shortDateStr(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function dueDateDisplay(dateStr){
  const t = todayStr();
  if(dateStr < t){
    const days = Math.round((new Date(t+'T00:00:00') - new Date(dateStr+'T00:00:00')) / 86400000);
    return {cls:'due-overdue', text: days===1 ? '1 day overdue' : `${days} days overdue`};
  }
  if(dateStr === t) return {cls:'due-today',   text:'Due today'};
  if(dateStr === addDays(t,1)) return {cls:'due-soon', text:'Due tomorrow'};
  const d = new Date(dateStr+'T00:00:00');
  return {cls:'due-soon', text:`Due ${d.getDate()} ${MONTHS[d.getMonth()]}`};
}

function taskIcon(task){
  const n = task.name.toLowerCase();
  if(task.isDeepClean) return 'sparkles';
  if(/kitchen|cook|dish|oven/i.test(n))          return 'utensils';
  if(/bath|toilet|shower|basin/i.test(n))         return 'droplets';
  if(/vacuum|sweep|mop|floor|dust/i.test(n))      return 'wind';
  if(/laundry|wash|sheet|linen/i.test(n))         return 'washing-machine';
  if(/bin|rubbish|trash|shop|errand|buy/i.test(n))return 'shopping-bag';
  if(/garden|mow|lawn|outdoor/i.test(n))          return 'sun';
  return 'list-checks';
}

function gcalLink(task){
  const start = task.dueDate.replace(/-/g,'');
  const end   = addDays(task.dueDate, 1).replace(/-/g,'');
  const details = `${freqLabel(task)} · ${task.difficulty}${task.isDeepClean?' · Deep Clean':''}${task.room?' · '+task.room:''}`;
  let recur = '';
  if(task.frequency==='daily')            recur='&recur=RRULE:FREQ=DAILY';
  else if(task.frequency==='weekly')      recur='&recur=RRULE:FREQ=WEEKLY';
  else if(task.frequency==='fortnightly') recur='&recur=RRULE:FREQ=WEEKLY;INTERVAL=2';
  else if(task.frequency==='monthly')     recur='&recur=RRULE:FREQ=MONTHLY';
  else if(task.frequency==='custom'&&task.customDays) recur=`&recur=RRULE:FREQ=DAILY;INTERVAL=${task.customDays}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(task.name)}&dates=${start}/${end}&details=${encodeURIComponent(details)}${recur}`;
}
function shouldShowCal(task){
  return task.assignee === 'Both' || task.assignee === myName();
}

/* ════════════════════════════════════════ STORAGE */
const LS_KEY = 'ht-v3';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(S)); }catch(e){} }
function loadLocal(){
  try{ const d = localStorage.getItem(LS_KEY); if(d) return JSON.parse(d); }catch(e){}
  return null;
}
function save(){ HOUSEHOLD.set(S); saveLocal(); }
function defaultState(){ return {name1:'Zac',name2:'Ella',setup:false,tasks:makeDefaultTasks(),completedLog:[],dates:{toVisit:[],visited:[],wheelLog:[]},email1:'',email2:'',
  // Meal Prep week state — small + hot, so it lives in the main doc alongside
  // everything else. Saved recipes themselves go in a subcollection (stage 3+).
  mealPrep:{style:null, proteins:[], activeRecipeIds:[], grocery:[], dismissed:[], mealLog:[], loggedIds:[]}}; }

// Deep-merges `source` onto `defaults` — a missing nested field (e.g. a
// legacy doc without dates.visited) falls back to its default instead of
// the whole nested object being replaced wholesale, which is what a plain
// Object.assign(defaultState(), source) would otherwise do.
function deepMerge(defaults, source){
  if(Array.isArray(defaults) || Array.isArray(source)) return source !== undefined ? source : defaults;
  if(typeof defaults!=='object' || defaults===null || typeof source!=='object' || source===null){
    return source !== undefined ? source : defaults;
  }
  const out = {...defaults};
  for(const key of Object.keys(source)) out[key] = deepMerge(defaults[key], source[key]);
  return out;
}

// Applies `mutate` to the local state immediately (so the UI updates without
// waiting on a round trip), then re-applies that same mutation inside a
// Firestore transaction against a FRESH read of the server document. Two
// near-simultaneous edits from different devices each replay their own
// change on top of the other's, instead of one full-document .set() blindly
// overwriting whatever the other device just wrote.
// Replace the panel's content while preserving scroll position and, when
// possible, the focused input (value, caret and focus). A raw innerHTML
// rebuild resets all three, which is what made actions mid-scroll or
// mid-typing feel like a page reload — same family as the Rooms-tab and
// Tasks-header glitches. switchTab still zeroes scrollTop explicitly for
// genuine tab changes.
// While set, the header-collapse scroll listener treats events as position
// sync only (updates lastY, never flips collapse state). The innerHTML
// wipe + scrollTop restore below emits scroll events whose deltas look like
// user swipes — desktop engines coalesce them to a net-zero delta, but iOS
// Safari's compositor timing can deliver them separately (worse mid-
// momentum), and a phantom few-hundred-px delta flips expand/collapse and
// produces the real-iPhone-only header jump.
let panelScrollGuardUntil = 0;

function setPanelHTML(html){
  const panel = document.getElementById('panel');
  const st = panel.scrollTop;
  const ae = document.activeElement;
  const focusId = (ae && ae.id && panel.contains(ae)) ? ae.id : null;
  const val   = focusId && 'value' in ae ? ae.value : null;
  let caret = null;
  if(focusId){ try{ caret = ae.selectionStart; }catch(e){} }
  panel.innerHTML = html;
  panel.scrollTop = st;
  panelScrollGuardUntil = performance.now() + 250;
  if(focusId){
    const el = document.getElementById(focusId);
    if(el){
      if(val != null && 'value' in el && el.value !== val) el.value = val;
      el.focus({preventScroll:true});
      try{ if(caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }catch(e){}
    }
  }
}

// Order-independent serialization for change detection: Firestore's data()
// does not guarantee the same key order as the local copy.
function stableStr(v){
  if(v === null || typeof v !== 'object') return JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(stableStr).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
}

function commitChange(mutate){
  const fallbackBase = JSON.parse(JSON.stringify(S)); // pre-mutation snapshot; only used if no remote doc exists yet
  mutate(S);
  saveLocal();
  db.runTransaction(async tx => {
    const snap = await tx.get(HOUSEHOLD);
    const fresh = snap.exists ? deepMerge(defaultState(), snap.data()) : fallbackBase;
    mutate(fresh);
    tx.set(HOUSEHOLD, fresh);
  }).catch(err => console.error('Sync failed:', err));
}

// Which shared name slot ('name1'/'name2') *this device* belongs to. This is
// local-only and deliberately never synced to Firestore — it's what lets a
// second device join an existing household without overwriting the shared
// name fields (see boot logic below).
const ROLE_KEY = 'ht-role';
function loadRole(){ try{ return localStorage.getItem(ROLE_KEY); }catch(e){ return null; } }
function saveRole(role){ try{ localStorage.setItem(ROLE_KEY, role); }catch(e){} }
let myRole = loadRole(); // 'name1' | 'name2' | null (not chosen yet)
function myName(){ return myRole==='name2' ? S.name2 : S.name1; }

// Small safe wrappers for the growing set of per-device preferences.
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

// Done/Skip buttons on task cards: hidden by default in favour of swiping.
// Always shown on non-touch devices, where swiping isn't possible.
function showTaskButtons(){
  return lsGet('ht-task-buttons')==='1' || !('ontouchstart' in window);
}

// Permanently-compact Tasks header (per-device): the mini glass bar replaces
// the big greeting header entirely, and scroll-collapse is switched off.
function alwaysCompactHdr(){ return lsGet('ht-hdr-compact')==='1'; }

/* ── theme: light is the permanent default at all hours. Dark is a
   manual opt-in from Settings only — the old time-of-day auto-switch
   is retired. Local-only preference, never synced. */
const THEME_KEY = 'ht-theme'; // 'light' | 'dark'
function loadThemePref(){
  try{
    const v = localStorage.getItem(THEME_KEY);
    // migrate the retired 'auto' pref (and anything unexpected) to light
    return v === 'dark' ? 'dark' : 'light';
  }catch(e){ return 'light'; }
}
function saveThemePref(v){ try{ localStorage.setItem(THEME_KEY, v); }catch(e){} }
function applyTheme(){
  const t = loadThemePref();
  document.documentElement.dataset.theme = t;
  document.getElementById('meta-theme')?.setAttribute('content', t==='light' ? '#EEF3F9' : '#10131C');
}
applyTheme();
function makeDefaultTasks(){
  const t = todayStr();
  return [
    {id:uid(), name:'Clean kitchen',     assignee:'Zac',  frequency:'weekly',      customDays:7,  dueDate:t,              difficulty:'Easy',   isDeepClean:false, room:'Kitchen'},
    {id:uid(), name:'Vacuum living room',assignee:'Both', frequency:'weekly',      customDays:7,  dueDate:addDays(t,1),   difficulty:'Easy',   isDeepClean:false, room:'Living Room'},
    {id:uid(), name:'Clean bathrooms',   assignee:'Ella', frequency:'fortnightly', customDays:14, dueDate:addDays(t,2),   difficulty:'Medium', isDeepClean:true,  room:'Bathroom (Living)'},
    {id:uid(), name:'Do the laundry',    assignee:'Both', frequency:'weekly',      customDays:7,  dueDate:addDays(t,3),   difficulty:'Easy',   isDeepClean:false, room:'Laundry'},
    {id:uid(), name:'Take out bins',     assignee:'Zac',  frequency:'weekly',      customDays:7,  dueDate:addDays(t,4),   difficulty:'Easy',   isDeepClean:false, room:'Outdoor'},
    {id:uid(), name:'Mop floors',        assignee:'Ella', frequency:'fortnightly', customDays:14, dueDate:addDays(t,5),   difficulty:'Medium', isDeepClean:false, room:'Living Room'},
  ];
}

/* ════════════════════════════════════════ PROGRESS */
function weekProgress(){
  const ws = getWeekStart(), we = addDays(ws, 6);
  const logThisWeek = (S.completedLog||[]).filter(l => l.completedAt >= ws && l.completedAt <= we);
  const doneThisWeek = logThisWeek.length;
  // A short-cycle task (daily etc.) gets rescheduled to a date that can still
  // fall inside the current week the moment it's completed. Excluding
  // already-completed-this-week task ids from the pending count keeps each
  // task counted once — either done or pending, never both.
  const completedIds = new Set(logThisWeek.map(l => l.taskId));
  const pendingThisWeek = S.tasks.filter(t => t.dueDate >= ws && t.dueDate <= we && !completedIds.has(t.id)).length;
  const total = doneThisWeek + pendingThisWeek;
  const pct   = total ? Math.round(doneThisWeek/total*100) : 0;
  return {done: doneThisWeek, total, pct};
}

// Twilight hero ring: thin gradient arc with a glowing comet-tip dot at the
// arc's end. The gradient id is randomized because the SVG can exist twice
// in the DOM during header transitions.
function ringHTML(pct, size=150, sw=3){
  const cx = size/2, cy = size/2, r = (size - sw - 12)/2;
  const C = 2*Math.PI*r, off = C*(1 - pct/100);
  const ang = -Math.PI/2 + (Math.min(pct,100)/100)*2*Math.PI;
  const tx = cx + r*Math.cos(ang), ty = cy + r*Math.sin(ang);
  const gid = 'rg' + uid();
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--acc-a)"/><stop offset="1" stop-color="var(--acc-b)"/>
    </linearGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${sw}"/>
    <circle class="ring-arc" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${sw}"
      stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 ${cx} ${cy})"/>
    ${pct > 0 ? `<circle class="ring-tip" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="4" fill="var(--acc-a)"/>` : ''}
  </svg>`;
}

/* ════════════════════════════════════════ TASKS TAB */
function updateMiniHdr(){
  const isRooms = tasksSubView==='rooms'||tasksSubView==='roomDetail';
  document.getElementById('mh-tasks-btn')?.classList.toggle('active', !isRooms);
  document.getElementById('mh-rooms-btn')?.classList.toggle('active', isRooms);
}

function renderTasks(){
  const inRooms = tasksSubView==='rooms'||tasksSubView==='roomDetail';
  const inHist  = tasksSubView==='history';
  const prog = weekProgress();
  if(alwaysCompactHdr()){
    // Permanent mini state: no big header at all, the glass bar is always on
    // and the in-panel toggle row is skipped (_tabsRowHTML returns '').
    isHdrCollapsed = false;
    document.getElementById('hdr').innerHTML = '';
    const miniHdr = document.getElementById('mini-hdr');
    miniHdr.classList.add('visible');
    document.getElementById('panel').style.paddingTop = miniHdr.offsetHeight + 'px';
  } else if(inRooms || inHist){
    // Rooms and Completed-history get the compact, static header: the weekly
    // ring is Tasks-view context, and the collapsing behavior has nowhere to
    // go on a short grid — it caused a visible layout glitch. A one-line
    // count keeps the context.
    const sub = inHist
      ? `<b>${(S.completedLog||[]).length}</b> completed all-time`
      : `<b>${prog.done} of ${prog.total}</b> done this week`;
    document.getElementById('hdr').innerHTML = `
      <div class="tasks-hdr compact">
        <div class="hh-top">
          <div>
            <div class="hh-hello">${greeting()}</div>
            <div class="hh-name">${escapeHtml(myName())}</div>
          </div>
          <div class="hh-avatar">${escapeHtml((myName()||'?')[0].toUpperCase())}</div>
        </div>
        <div class="compact-sub">${sub}</div>
      </div>`;
    // The compact header never collapses — clear any collapse state carried
    // over from the Tasks list (e.g. arriving via the mini-header's Rooms tab).
    isHdrCollapsed = false;
    document.getElementById('mini-hdr')?.classList.remove('visible');
    const panel = document.getElementById('panel');
    panel.style.paddingTop = '';
  } else {
    document.getElementById('hdr').innerHTML = `
      <div class="tasks-hdr">
        <div class="hh-top">
          <div>
            <div class="hh-hello">${greeting()}</div>
            <div class="hh-name">${escapeHtml(myName())}</div>
          </div>
          <div class="hh-avatar">${escapeHtml((myName()||'?')[0].toUpperCase())}</div>
        </div>
        <div class="hero-ring">${ringHTML(prog.pct)}<div class="ring-in"><b>${prog.pct}</b><span>% this week</span></div></div>
        <div class="hero-sub"><b>${prog.done} of ${prog.total}</b> · ${weekLabel(getWeekStart())}</div>
      </div>`;
    // Re-apply collapsed state without transition after the header DOM is rebuilt
    if(isHdrCollapsed){
      const hdr = document.querySelector('#hdr .tasks-hdr');
      if(hdr){
        hdr.style.transition='none'; hdr.style.height='0';
        hdr.style.paddingTop='0px'; hdr.style.paddingBottom='0px'; // border-box floor — see initScrollCollapse
        hdr.classList.add('collapsing');
      }
    }
  }
  lucide.createIcons();
  if(inHist)                                      _renderHistoryPanel();
  else if(tasksSubView==='rooms')                 _renderRoomsPanel();
  else if(tasksSubView==='roomDetail'&&currentRoomDetail) _renderRoomDetailPanel(currentRoomDetail);
  else                                            _renderTasksPanel();
  updateMiniHdr();
  // A re-render can shrink the list under a collapsed header (task completed,
  // partner sync): the browser clamps scrollTop toward 0, and those clamp
  // events are swallowed by panelScrollGuardUntil — stranding the mini-header
  // stacked over the in-panel Tasks/Rooms toggle row with no scroll room left
  // to ever expand out of it. Snap instantly back to the expanded state
  // whenever the collapsed state no longer matches the real scroll position.
  if(isHdrCollapsed){
    const panel = document.getElementById('panel');
    if(panel.scrollTop <= 60 || panel.scrollHeight - panel.clientHeight <= 60){
      isHdrCollapsed = false;
      const hdr = document.querySelector('#hdr .tasks-hdr');
      if(hdr){
        hdr.classList.remove('collapsing');
        hdr.style.transition='none';
        hdr.style.height=''; hdr.style.paddingTop=''; hdr.style.paddingBottom='';
      }
      document.getElementById('mini-hdr')?.classList.remove('visible');
      panel.style.transition='none';
      panel.style.paddingTop='';
      requestAnimationFrame(()=>{ panel.style.transition=''; if(hdr) hdr.style.transition=''; });
    }
  }
}
function _tabsRowHTML(activeTab){
  // Permanent-compact mode: the mini bar already provides tabs, history and
  // add — an in-panel copy would just duplicate it (the double-toggle bug).
  if(alwaysCompactHdr()) return '';
  const t = activeTab==='tasks', r = activeTab==='rooms';
  return `<div class="tasks-view-row">
    <div class="tasks-view-chips">
      <button class="tv-chip${t?' sel':''}" id="view-tasks"><i data-lucide="list-checks"></i>Tasks</button>
      <button class="tv-chip${r?' sel':''}" id="view-rooms"><i data-lucide="layout-grid"></i>Rooms</button>
    </div>
    <div class="tvr-actions">
      <button class="tab-hist-btn" id="hdr-hist" aria-label="Completed history"><i data-lucide="history"></i></button>
      <button class="tab-add-btn" id="hdr-add"><i data-lucide="plus"></i></button>
    </div>
  </div>`;
}
function _bindTabListeners(){
  const a=document.getElementById('hdr-add'); if(a) a.onclick=openAddTaskSheet;
  const t=document.getElementById('view-tasks'); if(t) t.onclick=()=>{ tasksSubView='tasks'; currentRoomDetail=null; renderTasks(); };
  const r=document.getElementById('view-rooms'); if(r) r.onclick=()=>{ tasksSubView='rooms'; currentRoomDetail=null; renderTasks(); };
  const h=document.getElementById('hdr-hist'); if(h) h.onclick=()=>{
    tasksSubView='history'; currentRoomDetail=null; renderTasks();
    // A sub-view change is real navigation — start at the top (setPanelHTML
    // preserves scroll and its guard swallows this programmatic jump).
    document.getElementById('panel').scrollTop = 0;
  };
}
function _renderTasksPanel(){
  const t = todayStr();
  const overdue  = S.tasks.filter(x=>x.dueDate<t).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const upcoming = S.tasks.filter(x=>x.dueDate>=t).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const byDate = {};
  upcoming.forEach(x=>{ (byDate[x.dueDate]=byDate[x.dueDate]||[]).push(x); });
  let html = _tabsRowHTML('tasks');
  if(overdue.length){
    html += `<div class="day-header">
      <div class="day-label overdue-lbl">Overdue</div>
      <button class="overdue-bulk" id="overdue-bulk"><i data-lucide="calendar-check"></i>Move all to today</button>
    </div>`;
    overdue.forEach(x=>{ html+=taskCardHTML(x); });
  }
  const dates = Object.keys(byDate).sort();
  if(!dates.length&&!overdue.length){
    html += `<div class="empty-state"><i data-lucide="check-circle-2"></i><p>All clear! Tap + to add tasks.</p></div>`;
  }
  // One-time swipe hint: shown until the first successful swipe (or tap).
  if((overdue.length || dates.length) && !showTaskButtons() && lsGet('ht-swipe-hint')!=='done'){
    html += `<div class="swipe-hint" id="swipe-hint"><i data-lucide="move-horizontal"></i>Swipe a task right to complete, left to skip</div>`;
  }
  dates.forEach(date=>{
    const isToday = date===t;
    html += `<div class="day-header">
      <div class="day-label ${isToday?'today-lbl':''}">${dayLabelFor(date)}</div>
      <div class="day-date-pill">${shortDateStr(date)}</div>
    </div>`;
    byDate[date].forEach(x=>{ html+=taskCardHTML(x); });
  });
  setPanelHTML(html);
  lucide.createIcons();
  _bindTabListeners();
  _bindTaskCards();
  const bulk = document.getElementById('overdue-bulk');
  if(bulk) bulk.onclick = ()=>{
    const n = S.tasks.filter(x=>x.dueDate<todayStr()).length;
    if(!n || !confirm(`Reschedule ${n===1?'the overdue task':'all '+n+' overdue tasks'} to today? Their recurrence continues from today.`)) return;
    commitChange(state => {
      const today = todayStr();
      state.tasks.forEach(x=>{ if(x.dueDate < today) x.dueDate = today; });
    });
    renderTasks();
  };
}
// Past-date label for the completed log (dayLabelFor is future-oriented).
function histDayLabel(dateStr){
  const t = todayStr();
  if(dateStr === t) return 'Today';
  if(dateStr === addDays(t,-1)) return 'Yesterday';
  const d = new Date(dateStr+'T00:00:00');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function histEntryHTML(l){
  const dc = {Easy:'hi-easy', Medium:'hi-medium', Hard:'hi-hard'}[l.difficulty]||'hi-easy';
  return `<div class="hist-entry">
    <div class="he-icon"><i data-lucide="check-circle-2"></i></div>
    <div class="he-main">
      <div class="he-name">${escapeHtml(l.name)}</div>
      <div class="he-meta">
        <span class="hi-diff ${dc}">${l.difficulty||'Easy'}</span>
        <span class="he-who"><i data-lucide="user"></i>${escapeHtml(l.assignee||'')}</span>
        ${l.isDeepClean?'<span class="he-dc"><i data-lucide="sparkles"></i></span>':''}
      </div>
    </div>
    <button class="he-restore" data-restore="${l.id}"><i data-lucide="undo-2"></i>Restore</button>
  </div>`;
}

function _renderHistoryPanel(){
  // Entries written before the log carried ids can't be targeted by Restore —
  // backfill ids once so every row is addressable.
  if((S.completedLog||[]).some(l=>!l.id)){
    commitChange(state => { (state.completedLog||[]).forEach(l=>{ if(!l.id) l.id=uid(); }); });
  }
  const log = S.completedLog||[];
  let html = `<button class="room-back" id="hist-back-btn"><i data-lucide="arrow-left"></i>Completed</button>`;
  if(!log.length){
    html += `<div class="empty-state"><i data-lucide="history"></i><p>Nothing completed yet — finished tasks will show up here.</p></div>`;
  } else {
    // Most recent first. completedAt is date-only, so within the same day the
    // later array entry (pushed later) is the more recent completion.
    const entries = log.map((l,i)=>({l,i}))
      .sort((a,b)=> b.l.completedAt.localeCompare(a.l.completedAt) || b.i - a.i);
    let curDay = null;
    entries.forEach(({l})=>{
      if(l.completedAt !== curDay){
        curDay = l.completedAt;
        html += `<div class="day-header">
          <div class="day-label">${histDayLabel(curDay)}</div>
          <div class="day-date-pill">${shortDateStr(curDay)}</div>
        </div>`;
      }
      html += histEntryHTML(l);
    });
  }
  setPanelHTML(html);
  lucide.createIcons();
  document.getElementById('hist-back-btn').onclick = ()=>{
    tasksSubView='tasks'; renderTasks();
    document.getElementById('panel').scrollTop = 0;
  };
  document.querySelectorAll('[data-restore]').forEach(btn=>
    btn.addEventListener('click', ()=>restoreCompletion(btn.dataset.restore)));
}

// Undo a completion. For the task's LATEST completion this rewinds the
// schedule too: dueDate goes back to what it was when "Done" was tapped
// (prevDueDate, stored at completion time), so the pending occurrence returns
// exactly as if it was never marked done — even if that makes it overdue.
// For an OLDER entry (the task has been completed again since), the newer
// completion owns the current schedule, so undo only removes the log entry
// and the stats correct themselves. Legacy entries without prevDueDate fall
// back to stepping dueDate back by the task's current frequency.
function restoreCompletion(logId){
  const list = S.completedLog||[];
  const idx = list.findIndex(l=>l.id===logId);
  if(idx < 0) return;
  const entry = list[idx];
  const task = S.tasks.find(t=>t.id===entry.taskId);
  const isLatest = !list.some((l,i)=> i>idx && l.taskId===entry.taskId);
  let msg;
  if(!task)          msg = `"${entry.name}" no longer exists as a task — this will just remove the history entry.`;
  else if(!isLatest) msg = `"${entry.name}" has been completed again since — this removes just this history entry without changing its schedule.`;
  else {
    const revertTo = entry.prevDueDate || addDays(task.dueDate, -getFreqDays(task));
    msg = `Restore "${entry.name}"? It goes back to the pending list, due ${shortDateStr(revertTo)}.`;
  }
  if(!confirm(msg)) return;
  applyRestore(logId);
}

// The confirm-free core of Restore — also the post-Done Undo toast's action.
function applyRestore(logId){
  commitChange(state => {
    const li = (state.completedLog||[]).findIndex(l=>l.id===logId);
    if(li < 0) return;
    const e = state.completedLog[li];
    const latest = !state.completedLog.some((l,j)=> j>li && l.taskId===e.taskId);
    state.completedLog.splice(li, 1);
    if(latest){
      const tk = state.tasks.find(t=>t.id===e.taskId);
      if(tk) tk.dueDate = e.prevDueDate || addDays(tk.dueDate, -getFreqDays(tk));
    }
  });
  renderTasks();
}
function _renderRoomsPanel(){
  let html = _tabsRowHTML('rooms');
  html += '<div class="room-grid">';
  ROOM_CHIPS.forEach(room=>{
    const count = S.tasks.filter(t=>t.room===room.name).length;
    html += `<div class="room-tile" data-room-nav="${room.name}">
      <div class="room-badge ${count===0?'zero':''}">${count}</div>
      <div class="room-tile-icon"><i data-lucide="${room.icon}"></i></div>
      <div class="room-tile-name">${room.name}</div>
    </div>`;
  });
  html += '</div>';
  setPanelHTML(html);
  lucide.createIcons();
  _bindTabListeners();
  document.querySelectorAll('[data-room-nav]').forEach(tile=>{
    tile.addEventListener('click',()=>{ tasksSubView='roomDetail'; currentRoomDetail=tile.dataset.roomNav; renderTasks(); });
  });
}
function _renderRoomDetailPanel(roomName){
  const room = ROOM_CHIPS.find(r=>r.name===roomName);
  const tasks = S.tasks.filter(t=>t.room===roomName).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const t = todayStr();
  let html = _tabsRowHTML('rooms');
  html += `<button class="room-back" id="room-back-btn"><i data-lucide="arrow-left"></i>${roomName}</button>`;
  if(!tasks.length){
    html += `<div class="empty-state"><i data-lucide="${room?room.icon:'layout-grid'}"></i><p>No tasks in ${roomName}</p></div>`;
  } else {
    const overdue  = tasks.filter(x=>x.dueDate<t);
    const upcoming = tasks.filter(x=>x.dueDate>=t);
    if(overdue.length){ html+=`<div class="day-header"><div class="day-label" style="color:var(--red)">Overdue</div></div>`; overdue.forEach(x=>{html+=taskCardHTML(x);}); }
    upcoming.forEach(x=>{html+=taskCardHTML(x);});
  }
  setPanelHTML(html);
  lucide.createIcons();
  _bindTabListeners();
  document.getElementById('room-back-btn').onclick=()=>{ tasksSubView='rooms'; currentRoomDetail=null; renderTasks(); };
  _bindTaskCards();
}

function taskCardHTML(task){
  const diff  = task.difficulty || 'Easy';
  const cls   = {Easy:'easy', Medium:'medium', Hard:'hard'}[diff] || 'easy';
  const diffCls = {Easy:'ez', Medium:'md', Hard:'hd'}[diff] || 'ez';
  const due   = dueDateDisplay(task.dueDate);

  return `<div class="task-card ${cls}" data-task-card="${task.id}">
    <div class="tc-reveal tc-reveal-done"><i data-lucide="check"></i>Done</div>
    <div class="tc-reveal tc-reveal-skip"><i data-lucide="skip-forward"></i>Skip</div>
    <div class="tc-inner">
      <div class="tc-top">
        <div class="tc-icon"><i data-lucide="${taskIcon(task)}"></i></div>
        <div class="tc-main">
          <div class="tc-title">${escapeHtml(task.name)}</div>
          <div class="tc-badges">
            <span class="badge badge-who"><i data-lucide="user"></i>${escapeHtml(task.assignee)}</span>
            <span class="badge badge-freq">${freqLabel(task)}</span>
            <span class="badge badge-diff ${diffCls}">${diff}</span>
            ${task.isDeepClean ? '<span class="badge badge-dc"><i data-lucide="sparkles"></i>Deep clean</span>' : ''}
          </div>
          <div class="tc-due ${due.cls}">
            <i data-lucide="calendar"></i>${due.text}
          </div>
        </div>
      </div>
      ${showTaskButtons() ? `<div class="tc-actions">
        <button class="tc-act" data-skip="${task.id}"><i data-lucide="skip-forward"></i>Skip</button>
        <button class="tc-act done-act" data-done="${task.id}"><i data-lucide="check"></i>Done</button>
      </div>` : ''}
    </div>
  </div>`;
}

/* ── swipe gestures on task cards ─────────────────────────────
   Right = Done, left = Skip. touch-action:pan-y leaves vertical scrolling
   to the browser; we claim the gesture only once movement is clearly
   horizontal, then preventDefault so the panel doesn't scroll under it. */
const SWIPE_THRESH = 88;
function attachSwipe(card){
  const inner = card.querySelector('.tc-inner');
  if(!inner) return;
  const id = card.dataset.taskCard;
  let startX=0, startY=0, dx=0, engaged=false, cancelled=false;
  const reset = ()=>{
    inner.style.transition = '';
    inner.style.transform = '';
    card.classList.remove('swiping-done','swiping-skip','swipe-armed');
  };
  card.addEventListener('touchstart', e=>{
    if(e.touches.length !== 1) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    dx = 0; engaged = false; cancelled = false;
    inner.style.transition = 'none';
  }, {passive:true});
  card.addEventListener('touchmove', e=>{
    if(cancelled) return;
    const mx = e.touches[0].clientX - startX;
    const my = e.touches[0].clientY - startY;
    if(!engaged){
      // Vertical intent wins immediately — never fight the scroll.
      if(Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)){ cancelled = true; return; }
      if(Math.abs(mx) > 14 && Math.abs(mx) > Math.abs(my)*1.4) engaged = true;
      else return;
    }
    if(e.cancelable) e.preventDefault();
    dx = mx;
    // Rubber-band damping past the trigger point
    const damped = dx < -SWIPE_THRESH ? -SWIPE_THRESH + (dx+SWIPE_THRESH)*.25
                 : dx >  SWIPE_THRESH ?  SWIPE_THRESH + (dx-SWIPE_THRESH)*.25 : dx;
    inner.style.transform = `translateX(${damped}px)`;
    card.classList.toggle('swiping-done', dx > 12);
    card.classList.toggle('swiping-skip', dx < -12);
    card.classList.toggle('swipe-armed', Math.abs(dx) >= SWIPE_THRESH);
  }, {passive:false});
  card.addEventListener('touchend', e=>{
    if(!engaged){ inner.style.transition=''; return; }
    // Suppress the synthetic click that follows touchend, so the re-rendered
    // card under the same spot doesn't spuriously open its detail sheet.
    if(e.cancelable) e.preventDefault();
    inner.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1)';
    if(dx >= SWIPE_THRESH){
      lsSet('ht-swipe-hint','done');
      inner.style.transform = 'translateX(105%)';
      setTimeout(()=>completeTask(id), 150);
    } else if(dx <= -SWIPE_THRESH){
      lsSet('ht-swipe-hint','done');
      inner.style.transform = 'translateX(-105%)';
      setTimeout(()=>skipTask(id), 150);
    } else {
      reset();
    }
  });
  card.addEventListener('touchcancel', ()=>{ cancelled = true; reset(); });
}

// One shared binder for every panel that renders task cards.
function _bindTaskCards(){
  document.querySelectorAll('[data-done]').forEach(btn=>btn.addEventListener('click',e=>{ e.stopPropagation(); completeTask(btn.dataset.done); }));
  document.querySelectorAll('[data-skip]').forEach(btn=>btn.addEventListener('click',e=>{ e.stopPropagation(); skipTask(btn.dataset.skip); }));
  document.querySelectorAll('[data-task-card]').forEach(card=>{
    card.addEventListener('click',e=>{ if(e.target.closest('button,a')) return; openTaskDetail(card.dataset.taskCard); });
    attachSwipe(card);
  });
  const hint = document.getElementById('swipe-hint');
  if(hint) hint.onclick = ()=>{ lsSet('ht-swipe-hint','done'); hint.remove(); };
}

/* ── toast (single instance, auto-dismiss) ───────── */
let toastTimer = null;
function hideToast(){
  clearTimeout(toastTimer); toastTimer = null;
  document.getElementById('toast')?.classList.remove('show');
}
function showToast(msg, actionLabel, onAction){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div'); el.id = 'toast';
    document.getElementById('app').appendChild(el);
  }
  clearTimeout(toastTimer);
  el.innerHTML = `<div class="toast-ic"><i data-lucide="check"></i></div>
    <div class="toast-msg"></div>
    ${actionLabel ? '<button class="toast-act" id="toast-act"></button>' : ''}`;
  el.querySelector('.toast-msg').textContent = msg;
  if(actionLabel){
    const b = el.querySelector('#toast-act');
    b.textContent = actionLabel;
    b.onclick = ()=>{ hideToast(); onAction && onAction(); };
  }
  lucide.createIcons();
  el.classList.add('show');
  toastTimer = setTimeout(hideToast, 5000);
}

function completeTask(id){
  const t = S.tasks.find(x=>x.id===id); if(!t) return;
  const taskName = t.name;
  const logId = uid(), completedAt = todayStr();
  commitChange(state => {
    const task = state.tasks.find(t=>t.id===id); if(!task) return;
    // prevDueDate lets the Completed-history "Restore" rewind the schedule to
    // exactly the due date this completion advanced it from.
    state.completedLog.push({
      id:logId, taskId:id, name:task.name,
      completedAt, prevDueDate:task.dueDate, difficulty:task.difficulty,
      assignee:task.assignee, isDeepClean:task.isDeepClean
    });
    task.dueDate = addDays(task.dueDate, getFreqDays(task));
  });
  renderTasks();
  // Fat-finger escape hatch: same revert as the history Restore, no confirm.
  showToast(`${taskName} done`, 'Undo', ()=>applyRestore(logId));
}
function skipTask(id){
  if(!S.tasks.find(t=>t.id===id)) return;
  commitChange(state => {
    const task = state.tasks.find(t=>t.id===id); if(!task) return;
    task.dueDate = addDays(task.dueDate, getFreqDays(task));
  });
  renderTasks();
}

/* ── Add task sheet ──────────────────────────────── */
// Last-used add-sheet selections (per-device): adding a routine task should
// only need a name, not six re-answered questions.
function loadAddDefaults(){
  try{ return JSON.parse(lsGet('ht-add-defaults')||'{}') || {}; }catch(e){ return {}; }
}
function openAddTaskSheet(){
  const d = loadAddDefaults();
  let selWho  = [S.name1, S.name2, 'Both'].includes(d.assignee) ? d.assignee : myName();
  let selFreq = ['daily','weekly','fortnightly','monthly','custom'].includes(d.frequency) ? d.frequency : 'weekly';
  let selDiff = ['Easy','Medium','Hard'].includes(d.difficulty) ? d.difficulty : 'Easy';
  let isDeepClean = false;
  let selRoom = ROOM_CHIPS.some(r=>r.name===d.room) ? d.room : '';
  const defCustomDays = parseInt(d.customDays) || 3;
  const diffSelStyle = {
    Easy:  'color:var(--green);border-color:var(--green);background:var(--green-soft)',
    Medium:'color:var(--gold);border-color:var(--gold);background:var(--gold-soft)',
    Hard:  'color:var(--red);border-color:var(--red);background:var(--red-soft)',
  };

  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">New task</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <div class="sheet-field">
      <i data-lucide="pencil" class="ic"></i>
      <input id="nt-name" type="text" placeholder="Task name…">
    </div>
    <div>
      <div class="seg-lbl">Assign to</div>
      <div class="chips">
        <div class="chip ${selWho===S.name1?'sel':''}" data-who="${escapeHtml(S.name1)}"><i data-lucide="user"></i>&nbsp;${escapeHtml(S.name1)}</div>
        <div class="chip ${selWho===S.name2?'sel':''}" data-who="${escapeHtml(S.name2)}"><i data-lucide="user"></i>&nbsp;${escapeHtml(S.name2)}</div>
        <div class="chip ${selWho==='Both'?'sel':''}" data-who="Both"><i data-lucide="users"></i>&nbsp;Both</div>
      </div>
    </div>
    <div>
      <div class="seg-lbl">Frequency</div>
      <div class="chip-grid" id="freq-chips">
        <div class="chip ${selFreq==='daily'?'sel':''}" data-freq="daily">Daily</div>
        <div class="chip ${selFreq==='weekly'?'sel':''}" data-freq="weekly">Weekly</div>
        <div class="chip ${selFreq==='fortnightly'?'sel':''}" data-freq="fortnightly">Fortnightly</div>
        <div class="chip ${selFreq==='monthly'?'sel':''}" data-freq="monthly">Monthly</div>
        <div class="chip ${selFreq==='custom'?'sel':''}" data-freq="custom">Every X days</div>
      </div>
      <div id="custom-days-row" class="x-days-row" style="display:${selFreq==='custom'?'flex':'none'};margin-top:10px">
        <span>Every</span>
        <input class="x-days-input" id="nt-custom-days" type="number" value="${defCustomDays}" min="1" max="365">
        <span>days</span>
      </div>
    </div>
    <div>
      <div class="seg-lbl">Start date</div>
      <input class="sheet-date-input" id="nt-startdate" type="date" value="${todayStr()}">
    </div>
    <div>
      <div class="seg-lbl">Difficulty</div>
      <div class="chips">
        <div class="chip ${selDiff==='Easy'?'sel':''}" data-diff="Easy" style="${selDiff==='Easy'?diffSelStyle.Easy:''}">Easy</div>
        <div class="chip ${selDiff==='Medium'?'sel':''}" data-diff="Medium" style="${selDiff==='Medium'?diffSelStyle.Medium:''}">Medium</div>
        <div class="chip ${selDiff==='Hard'?'sel':''}" data-diff="Hard" style="${selDiff==='Hard'?diffSelStyle.Hard:''}">Hard</div>
      </div>
    </div>
    <div class="toggle-row">
      <div>
        <div class="toggle-lbl">Deep clean?</div>
        <div class="toggle-sub">Part of the cleaning routine</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="nt-deepclean">
        <div class="toggle-slider"></div>
      </label>
    </div>
    <div>
      <div class="seg-lbl">Room / Area</div>
      <div class="chip-grid" id="room-chips" style="grid-template-columns:repeat(3,1fr);gap:7px">
        ${ROOM_CHIPS.map(r=>`<div class="chip chip-sm ${selRoom===r.name?'sel':''}" data-room="${r.name}"><i data-lucide="${r.icon}"></i>&nbsp;${r.name}</div>`).join('')}
      </div>
    </div>
    <button class="btn-primary" id="create-task-btn">Add task <i data-lucide="check"></i></button>`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    document.getElementById('nt-name').focus();

    // Who chips
    document.querySelectorAll('[data-who]').forEach(el => el.addEventListener('click', ()=>{
      selWho = el.dataset.who;
      document.querySelectorAll('[data-who]').forEach(e => e.classList.toggle('sel', e===el));
    }));

    // Frequency chips
    document.querySelectorAll('[data-freq]').forEach(el => el.addEventListener('click', ()=>{
      selFreq = el.dataset.freq;
      document.querySelectorAll('[data-freq]').forEach(e => e.classList.toggle('sel', e===el));
      document.getElementById('custom-days-row').style.display = selFreq==='custom' ? 'flex' : 'none';
    }));

    // Difficulty chips — update styling dynamically
    const diffColors = {
      Easy:  {color:'var(--green)',   border:'var(--green)',    bg:'var(--green-soft)'},
      Medium:{color:'var(--gold)',      border:'var(--gold)',     bg:'var(--gold-soft)'},
      Hard:  {color:'var(--red)',     border:'var(--red)',      bg:'var(--red-soft)'},
    };
    document.querySelectorAll('[data-diff]').forEach(el => el.addEventListener('click', ()=>{
      selDiff = el.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach(e => {
        const on = e===el;
        const dc = diffColors[e.dataset.diff];
        e.style.color       = on ? dc.color  : '';
        e.style.borderColor = on ? dc.border : '';
        e.style.background  = on ? dc.bg     : '';
        e.classList.toggle('sel', on);
      });
    }));

    document.getElementById('nt-deepclean').addEventListener('change', e => {
      isDeepClean = e.target.checked;
    });

    document.querySelectorAll('[data-room]').forEach(el => el.addEventListener('click', ()=>{
      selRoom = el.dataset.room;
      document.querySelectorAll('[data-room]').forEach(e => e.classList.toggle('sel', e===el));
    }));

    document.getElementById('create-task-btn').onclick = ()=>{
      const name = document.getElementById('nt-name').value.trim();
      if(!name){ document.getElementById('nt-name').focus(); return; }
      const startDate  = document.getElementById('nt-startdate').value || todayStr();
      const customDays = parseInt(document.getElementById('nt-custom-days')?.value)||3;
      const newId = uid();
      commitChange(state => {
        state.tasks.push({
          id:newId, name, assignee:selWho, frequency:selFreq, customDays,
          dueDate:startDate, difficulty:selDiff, isDeepClean, room:selRoom
        });
      });
      // Remember these selections as next time's starting point.
      lsSet('ht-add-defaults', JSON.stringify({assignee:selWho, frequency:selFreq, customDays, difficulty:selDiff, room:selRoom}));
      closeSheet(); renderTasks();
    };
  });
}

/* ── Task detail sheet ───────────────────────────── */
function openTaskDetail(id){
  const task = S.tasks.find(t=>t.id===id); if(!task) return;
  const due = dueDateDisplay(task.dueDate);

  let selWho      = task.assignee;
  let selFreq     = task.frequency;
  let selDiff     = task.difficulty;
  let isDeepClean = task.isDeepClean;
  let selRoom     = task.room || '';

  const diffColors = {
    Easy:  {color:'var(--green)',  border:'var(--green)',  bg:'var(--green-soft)'},
    Medium:{color:'var(--gold)',     border:'var(--gold)',   bg:'var(--gold-soft)'},
    Hard:  {color:'var(--red)',    border:'var(--red)',    bg:'var(--red-soft)'},
  };
  function diffStyle(d){ const c=diffColors[d]; return `color:${c.color};border-color:${c.border};background:${c.bg}`; }

  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">Edit task</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <div class="sheet-field">
      <i data-lucide="pencil" class="ic"></i>
      <input id="et-name" type="text" value="${escapeHtml(task.name)}" placeholder="Task name…">
    </div>
    <div>
      <div class="seg-lbl">Assign to</div>
      <div class="chips">
        <div class="chip ${selWho===S.name1?'sel':''}" data-who="${escapeHtml(S.name1)}"><i data-lucide="user"></i>&nbsp;${escapeHtml(S.name1)}</div>
        <div class="chip ${selWho===S.name2?'sel':''}" data-who="${escapeHtml(S.name2)}"><i data-lucide="user"></i>&nbsp;${escapeHtml(S.name2)}</div>
        <div class="chip ${selWho==='Both'?'sel':''}" data-who="Both"><i data-lucide="users"></i>&nbsp;Both</div>
      </div>
    </div>
    <div>
      <div class="seg-lbl">Frequency</div>
      <div class="chip-grid">
        <div class="chip ${selFreq==='daily'?'sel':''}" data-freq="daily">Daily</div>
        <div class="chip ${selFreq==='weekly'?'sel':''}" data-freq="weekly">Weekly</div>
        <div class="chip ${selFreq==='fortnightly'?'sel':''}" data-freq="fortnightly">Fortnightly</div>
        <div class="chip ${selFreq==='monthly'?'sel':''}" data-freq="monthly">Monthly</div>
        <div class="chip ${selFreq==='custom'?'sel':''}" data-freq="custom">Every X days</div>
      </div>
      <div id="et-custom-days-row" class="x-days-row" style="display:${selFreq==='custom'?'flex':'none'};margin-top:10px">
        <span>Every</span>
        <input class="x-days-input" id="et-custom-days" type="number" value="${task.customDays||7}" min="1" max="365">
        <span>days</span>
      </div>
    </div>
    <div>
      <div class="seg-lbl">Due date <span style="color:var(--${due.cls==='due-overdue'?'red':'sky-deep'})">(${due.text})</span></div>
      <input class="sheet-date-input" id="et-duedate" type="date" value="${task.dueDate}">
    </div>
    <div>
      <div class="seg-lbl">Difficulty</div>
      <div class="chips">
        <div class="chip ${selDiff==='Easy'?'sel':''}" data-diff="Easy" style="${selDiff==='Easy'?diffStyle('Easy'):''}">Easy</div>
        <div class="chip ${selDiff==='Medium'?'sel':''}" data-diff="Medium" style="${selDiff==='Medium'?diffStyle('Medium'):''}">Medium</div>
        <div class="chip ${selDiff==='Hard'?'sel':''}" data-diff="Hard" style="${selDiff==='Hard'?diffStyle('Hard'):''}">Hard</div>
      </div>
    </div>
    <div class="toggle-row">
      <div>
        <div class="toggle-lbl">Deep clean?</div>
        <div class="toggle-sub">Part of the cleaning routine</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="et-deepclean" ${isDeepClean?'checked':''}>
        <div class="toggle-slider"></div>
      </label>
    </div>
    <div>
      <div class="seg-lbl">Room / Area</div>
      <div class="chip-grid" style="grid-template-columns:repeat(3,1fr);gap:7px">
        ${ROOM_CHIPS.map(r=>`<div class="chip chip-sm ${selRoom===r.name?'sel':''}" data-room="${r.name}"><i data-lucide="${r.icon}"></i>&nbsp;${r.name}</div>`).join('')}
      </div>
    </div>
    ${shouldShowCal(task) ? `
    <a class="gcal-card" href="${gcalLink(task)}" target="_blank" rel="noopener">
      <div class="gcal-card-icon"><i data-lucide="calendar-plus"></i></div>
      <div class="gcal-card-text">
        <div class="gcal-card-title">Add to Google Calendar</div>
        <div class="gcal-card-sub">Schedule · ${shortDateStr(task.dueDate)} · ${freqLabel(task)}</div>
      </div>
      <div class="gcal-card-arrow"><i data-lucide="external-link"></i></div>
    </a>` : ''}
    <div class="detail-btns">
      <button class="detail-btn del-btn" id="det-del"><i data-lucide="trash-2"></i>Delete</button>
      <button class="btn-primary" id="det-save" style="margin:0;flex:1"><i data-lucide="check"></i>Save changes</button>
    </div>`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;

    document.querySelectorAll('[data-who]').forEach(el => el.addEventListener('click', ()=>{
      selWho = el.dataset.who;
      document.querySelectorAll('[data-who]').forEach(e => e.classList.toggle('sel', e===el));
    }));

    document.querySelectorAll('[data-freq]').forEach(el => el.addEventListener('click', ()=>{
      selFreq = el.dataset.freq;
      document.querySelectorAll('[data-freq]').forEach(e => e.classList.toggle('sel', e===el));
      document.getElementById('et-custom-days-row').style.display = selFreq==='custom' ? 'flex' : 'none';
    }));

    document.querySelectorAll('[data-diff]').forEach(el => el.addEventListener('click', ()=>{
      selDiff = el.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach(e => {
        const on = e===el, dc = diffColors[e.dataset.diff];
        e.style.color       = on ? dc.color  : '';
        e.style.borderColor = on ? dc.border : '';
        e.style.background  = on ? dc.bg     : '';
        e.classList.toggle('sel', on);
      });
    }));

    document.getElementById('et-deepclean').addEventListener('change', e => { isDeepClean = e.target.checked; });

    document.querySelectorAll('[data-room]').forEach(el => el.addEventListener('click', ()=>{
      selRoom = el.dataset.room;
      document.querySelectorAll('[data-room]').forEach(e => e.classList.toggle('sel', e===el));
    }));

    document.getElementById('det-save').onclick = ()=>{
      // Look up the live task by id rather than closing over the object
      // captured when the sheet opened — a Firestore sync while the sheet
      // was open replaces S.tasks wholesale, which would otherwise orphan
      // that captured reference and silently drop this edit.
      if(!S.tasks.find(t=>t.id===id)){ closeSheet(); renderTasks(); return; }
      const name = document.getElementById('et-name').value.trim();
      if(!name){ document.getElementById('et-name').focus(); return; }
      const newAssignee = selWho, newFreq = selFreq;
      const parsedCustomDays = parseInt(document.getElementById('et-custom-days')?.value);
      const newDueDate = document.getElementById('et-duedate').value;
      const newDiff = selDiff, newDeepClean = isDeepClean, newRoom = selRoom;
      commitChange(state => {
        const current = state.tasks.find(t=>t.id===id); if(!current) return;
        current.name        = name;
        current.assignee    = newAssignee;
        current.frequency   = newFreq;
        current.customDays  = parsedCustomDays || current.customDays || 7;
        current.dueDate     = newDueDate || current.dueDate;
        current.difficulty  = newDiff;
        current.isDeepClean = newDeepClean;
        current.room        = newRoom;
      });
      closeSheet(); renderTasks();
    };

    document.getElementById('det-del').onclick = ()=>{
      if(!confirm('Delete this task?')) return;
      commitChange(state => { state.tasks = state.tasks.filter(t=>t.id!==id); });
      closeSheet(); renderTasks();
    };
  });
}

/* ════════════════════════════════════════ HISTORY TAB */
function histItem(l){
  const dc = {Easy:'hi-easy', Medium:'hi-medium', Hard:'hi-hard'}[l.difficulty]||'hi-easy';
  return `<div class="hist-item">
    <i data-lucide="check-circle-2" style="color:var(--green)"></i>
    <span class="hi-name">${escapeHtml(l.name)}</span>
    <span class="hi-diff ${dc}">${l.difficulty}</span>
    <span style="font-size:11.5px;font-weight:700;color:var(--muted)">${escapeHtml(l.assignee)}</span>
  </div>`;
}

let statsSubView = 'tasks';   // 'tasks' | 'meals' | 'dates'
let statsMealsPeriod = 'all'; // 'week' | 'month' | 'all'
function renderHistory(){
  document.getElementById('hdr').innerHTML = `
    <div class="flat-hdr">
      <div><div class="flat-hdr-title">Stats</div><div class="flat-hdr-sub">Household insights</div></div>
      <div class="flat-hdr-icon"><i data-lucide="bar-chart-2"></i></div>
    </div>`;

  const toggle = `<div class="tasks-view-row" style="padding-bottom:6px">
    <div class="tasks-view-chips">
      <button class="tv-chip${statsSubView==='tasks'?' sel':''}" id="sv-tasks"><i data-lucide="list-checks"></i>Tasks</button>
      <button class="tv-chip${statsSubView==='meals'?' sel':''}" id="sv-meals"><i data-lucide="chef-hat"></i>Meals</button>
      <button class="tv-chip${statsSubView==='dates'?' sel':''}" id="sv-dates"><i data-lucide="heart"></i>Dates</button>
    </div>
  </div>`;

  let body;
  if(statsSubView === 'meals')      body = _statsMealsHTML();
  else if(statsSubView === 'dates') body = _statsDatesHTML();
  else                              body = _statsTasksHTML();

  setPanelHTML(toggle + body);
  lucide.createIcons();
  document.getElementById('sv-tasks').onclick = ()=>{ statsSubView='tasks'; renderHistory(); };
  document.getElementById('sv-meals').onclick = ()=>{ statsSubView='meals'; renderHistory(); };
  document.getElementById('sv-dates').onclick = ()=>{ statsSubView='dates'; renderHistory(); };
  document.querySelectorAll('[data-mp-period]').forEach(el => el.addEventListener('click', ()=>{
    statsMealsPeriod = el.dataset.mpPeriod; renderHistory();
  }));
}

function _statsTasksHTML(){
  const log = S.completedLog || [];
  if(!log.length){
    return `<div class="empty-state"><i data-lucide="bar-chart-2"></i><p>No history yet — complete your first task!</p></div>`;
  }

  const ws     = getWeekStart();
  const prog   = weekProgress();
  const name1  = S.name1, name2 = S.name2;
  const now    = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  /* ── helpers ── */
  function mineLog(name){ return log.filter(l => l.assignee===name || l.assignee==='Both'); }

  function calcStreak(name){
    // If nothing done this week, start counting from last week so Monday mornings don't kill the streak
    const curHas = log.some(l => (l.assignee===name||l.assignee==='Both') && l.completedAt>=ws && l.completedAt<=addDays(ws,6));
    const start  = curHas ? 0 : 1;
    let streak = 0;
    for(let i=start; i<52; i++){
      const d  = new Date(ws+'T00:00:00'); d.setDate(d.getDate() - i*7);
      const wS = toLocalYMD(d), wE = addDays(wS,6);
      const has = log.some(l => (l.assignee===name||l.assignee==='Both') && l.completedAt>=wS && l.completedAt<=wE);
      if(has) streak++; else break;
    }
    return streak;
  }

  function topTask(name){
    const map = {};
    mineLog(name).forEach(l => { map[l.name] = (map[l.name]||0)+1; });
    const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
    return entries[0] || null;
  }

  /* ── 1. Current week card ── */
  const thisWeekItems = log.filter(l => l.completedAt>=ws && l.completedAt<=addDays(ws,6));

  let html = `<div style="padding:6px 16px 0">
    <div class="hist-card">
      <div class="hist-week">
        <span>${weekLabel(ws)} <b style="color:var(--sky-deep)">· This week</b></span>
        <span class="hist-pct">${prog.pct}%</span>
      </div>
      <div class="hist-bar"><i style="width:${prog.pct}%"></i></div>
      <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">${prog.done} done · ${prog.total - prog.done} pending</div>
      <div class="hist-items">
        ${thisWeekItems.map(l=>histItem(l)).join('')}
        ${!thisWeekItems.length ? '<div style="color:var(--muted);font-size:13.5px;font-weight:600">None completed yet this week</div>' : ''}
      </div>
    </div>
  </div>`;

  /* ── 2. 8-week completion bar chart ── */
  const weeks = [];
  for(let i=7; i>=0; i--){
    const d  = new Date(ws+'T00:00:00'); d.setDate(d.getDate() - i*7);
    const wS = toLocalYMD(d), wE = addDays(wS,6);
    weeks.push({ wS, done: log.filter(l=>l.completedAt>=wS&&l.completedAt<=wE).length, isCurrent: i===0 });
  }
  const maxDone = Math.max(...weeks.map(w=>w.done), 1);
  const BAR_MAX = 72;

  html += `<div style="padding:0 16px">
    <div class="stats-hdr-row"><span class="stats-hdr-title">8-Week Completions</span></div>
    <div class="week-chart">
      <div class="wc-val-row">${weeks.map(w=>`<div class="wc-val">${w.done||''}</div>`).join('')}</div>
      <div class="wc-chart-area">${weeks.map(w=>`
        <div class="wc-bar${w.isCurrent?' wc-current':''}" style="height:${Math.max(3,Math.round(w.done/maxDone*BAR_MAX))}px"></div>`).join('')}
      </div>
      <div class="wc-lbl-row">${weeks.map(w=>{
        const mo = new Date(w.wS+'T00:00:00');
        return `<div class="wc-lbl">${w.isCurrent ? 'Now' : MONTHS[mo.getMonth()]+' '+mo.getDate()}</div>`;
      }).join('')}</div>
    </div>
  </div>`;

  /* ── 3. Personal stats ── */
  function buildStats(name){
    const mine = mineLog(name);
    return {
      total:  mine.length,
      month:  mine.filter(l=>l.completedAt.startsWith(monthStr)).length,
      streak: calcStreak(name),
      top:    topTask(name)
    };
  }
  const s1 = buildStats(name1), s2 = buildStats(name2);

  function personCardHTML(name, st){
    return `<div class="person-card">
      <div class="pc-name-row">
        <div class="pc-avatar"><i data-lucide="user-round"></i></div>
        <div class="pc-name">${name}</div>
      </div>
      <div class="pc-big">${st.total}</div>
      <div class="pc-lbl">All-time done</div>
      <div class="pc-month-row">
        <div class="pc-month-val">${st.month}</div>
        <div class="pc-month-lbl">This month</div>
      </div>
      <div class="pc-streak-pill">
        <i data-lucide="flame"></i>
        <span>${st.streak}w streak</span>
      </div>
      ${st.top ? `<div class="pc-top-task">
        <div class="pc-top-task-lbl">Top task</div>
        <div class="pc-top-task-val">${st.top[0]}</div>
      </div>` : ''}
    </div>`;
  }

  html += `<div style="padding:0 16px">
    <div class="stats-hdr-row"><span class="stats-hdr-title">Personal Stats</span></div>
    <div class="person-cards">${personCardHTML(name1,s1)}${personCardHTML(name2,s2)}</div>
  </div>`;

  /* ── 4. Head to head ── */
  const t1 = s1.total, t2 = s2.total, tot = t1+t2||1;
  const p1pct = Math.round(t1/tot*100);
  const m1 = s1.month, m2 = s2.month;
  const monthLeader = m1>m2 ? name1 : m2>m1 ? name2 : null;

  html += `<div style="padding:0 16px">
    <div class="stats-hdr-row"><span class="stats-hdr-title">Head to Head</span></div>
    <div class="h2h-card">
      <div class="h2h-totals">
        <div class="h2h-side ${t1>=t2?'leading':''}">
          <div class="h2h-person">${name1}</div>
          <div class="h2h-num">${t1}</div>
        </div>
        <div class="h2h-vs">VS</div>
        <div class="h2h-side ${t2>=t1?'leading':''}">
          <div class="h2h-person">${name2}</div>
          <div class="h2h-num">${t2}</div>
        </div>
      </div>
      <div class="h2h-progress">
        <div class="h2h-p1" style="width:${p1pct}%"></div>
        <div class="h2h-p2" style="width:${100-p1pct}%"></div>
      </div>
      <div class="h2h-stats">
        <div class="h2h-stat">
          <div class="h2h-stat-v ${m1>m2?'win':''}">${m1}</div>
          <div class="h2h-stat-mid">This month</div>
          <div class="h2h-stat-v ${m2>m1?'win':''}">${m2}</div>
        </div>
        <div class="h2h-stat">
          <div class="h2h-stat-v ${s1.streak>s2.streak?'win':''}">${s1.streak}w</div>
          <div class="h2h-stat-mid">Streak</div>
          <div class="h2h-stat-v ${s2.streak>s1.streak?'win':''}">${s2.streak}w</div>
        </div>
      </div>
      <div class="h2h-badge" style="${!monthLeader?'background:var(--line);color:var(--ink-soft)':''}">
        ${monthLeader ? '🏆 '+monthLeader+' leading this month' : 'Tied this month'}
      </div>
    </div>
  </div>`;

  /* ── 5. Difficulty breakdown ── */
  const diffs = {Easy:0, Medium:0, Hard:0};
  log.forEach(l => { if(diffs[l.difficulty]!==undefined) diffs[l.difficulty]++; });
  const maxDiff = Math.max(...Object.values(diffs), 1);
  const diffColor = {Easy:'var(--green)', Medium:'var(--gold)', Hard:'var(--red)'};

  html += `<div style="padding:0 16px">
    <div class="stats-hdr-row"><span class="stats-hdr-title">By Difficulty</span></div>
    <div class="diff-card">
      ${Object.entries(diffs).map(([d,n]) => `
      <div class="diff-row">
        <div class="diff-dot" style="background:${diffColor[d]}"></div>
        <div class="diff-lbl">${d}</div>
        <div class="diff-track"><div class="diff-fill" style="width:${Math.round(n/maxDiff*100)}%;background:${diffColor[d]}"></div></div>
        <div class="diff-cnt">${n}</div>
      </div>`).join('')}
    </div>
  </div>`;

  /* ── 6. Most completed tasks ── */
  const taskMap = {};
  log.forEach(l => { taskMap[l.name] = (taskMap[l.name]||0)+1; });
  const topTasks = Object.entries(taskMap).sort((a,b)=>b[1]-a[1]).slice(0,6);

  if(topTasks.length){
    html += `<div style="padding:0 16px 8px">
      <div class="stats-hdr-row"><span class="stats-hdr-title">Most Completed</span></div>
      <div class="top-list">
        ${topTasks.map(([name,count],i) => `
        <div class="top-row">
          <div class="top-rank">${i+1}</div>
          <div class="top-name">${name}</div>
          <div class="top-badge">${count}×</div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  return html;
}

/* ── Stats · Meals: ranked proteins + meals from mealLog. A meal counts as
   eaten only once ALL its grocery lines were checked while it was still in
   the week's set (see recordMealCompletions). ── */
function _statsMealsHTML(){
  const log = (S.mealPrep?.mealLog) || [];
  const periodChips = `<div class="pk-row" style="padding:2px 16px 0">
    ${[['week','This week'],['month','This month'],['all','All time']].map(([id,lbl]) =>
      `<button class="pk-chip${statsMealsPeriod===id?' on':''}" data-mp-period="${id}">${lbl}</button>`).join('')}
  </div>`;
  if(!log.length){
    return periodChips + `<div class="empty-state">
      <i data-lucide="chef-hat"></i>
      <div class="es-title">No meals logged yet</div>
      <p>A meal counts once all of its grocery lines are checked off — plan a week and get shopping.</p>
    </div>`;
  }
  const now = new Date();
  const weekCut = new Date(getWeekStart() + 'T00:00:00').getTime();
  const monthCut = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const cut = statsMealsPeriod === 'week' ? weekCut : statsMealsPeriod === 'month' ? monthCut : 0;
  const entries = log.filter(e => (e.at || 0) >= cut);

  function rankedHTML(title, keyFn){
    const map = {};
    entries.forEach(e => { const k = keyFn(e); if(k) map[k] = (map[k] || 0) + 1; });
    const top = Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 6);
    let h = `<div style="padding:0 16px"><div class="stats-hdr-row"><span class="stats-hdr-title">${title}</span></div>`;
    if(!top.length){
      h += `<div class="rc-none" style="margin:0">Nothing in this period yet.</div>`;
    } else {
      h += `<div class="top-list">${top.map(([name, count], i) => `
        <div class="top-row">
          <div class="top-rank">${i+1}</div>
          <div class="top-name">${escapeHtml(name)}</div>
          <div class="top-badge">${count}×</div>
        </div>`).join('')}</div>`;
    }
    return h + `</div>`;
  }
  return periodChips
    + rankedHTML('Most-eaten proteins', e => e.protein)
    + rankedHTML('Most-eaten meals', e => e.name)
    + `<div style="text-align:center;font-size:11px;color:var(--muted);padding:14px 32px 8px">Counted when every grocery line for the recipe was checked off.</div>`;
}

/* ── Stats · Dates: derived from dates.visited / toVisit / wheelLog ── */
function _statsDatesHTML(){
  const visited = (S.dates?.visited) || [];
  const toVisit = (S.dates?.toVisit) || [];
  const wheelLog = (S.dates?.wheelLog) || [];
  if(!visited.length && !toVisit.length){
    return `<div class="empty-state">
      <i data-lucide="heart"></i>
      <div class="es-title">No date nights yet</div>
      <p>Add places on the Dates tab and give the wheel a spin.</p>
    </div>`;
  }
  const now = new Date();
  const monthCut = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = visited.filter(v => (v.visitedAt || 0) >= monthCut).length;
  const last = visited.reduce((m, v) => Math.max(m, v.visitedAt || 0), 0);
  const daysSince = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const lastTxt = last ? (daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`) : '—';

  // wheel follow-through: superseded picks (re-spun before deciding) are a
  // deliberate re-roll, not a failure to act — they leave the denominator
  // entirely and get their own line below.
  const visitedNames = new Set(visited.map(v => normKey(v.name || '')));
  const statuses = wheelLog.map(w => wheelPickStatus(w, visitedNames));
  const followed = statuses.filter(x => x === 'visited').length;
  const pending = statuses.filter(x => x === 'pending').length;
  const superseded = statuses.filter(x => x === 'superseded').length;
  const denom = followed + pending;
  const followTxt = !wheelLog.length ? 'No spins tracked yet'
    : !denom ? 'No decided spins yet'
    : `${followed} of ${denom} (${Math.round(followed / denom * 100)}%)`;

  let html = `<div style="padding:6px 16px 0"><div class="hist-card">
    ${[
      ['All-time date nights', String(visited.length)],
      ['This month', String(thisMonth)],
      ['On the to-visit list', String(toVisit.length)],
      ['Last date night', lastTxt],
      ['Wheel follow-through', followTxt],
      ['Re-spun before deciding', wheelLog.length ? String(superseded) : '—'],
    ].map(([k, v]) => `
      <div class="h2h-stat"><div class="h2h-stat-mid" style="text-align:left;flex:1">${k}</div>
      <div class="h2h-stat-v" style="width:auto;min-width:52px">${escapeHtml(v)}</div></div>`).join('')}
  </div></div>`;

  // monthly trend — last 8 calendar months, same chart language as 8-Week Completions
  const months = [];
  for(let i = 7; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({
      lbl: MONTHS[d.getMonth()],
      n: visited.filter(v => (v.visitedAt || 0) >= d.getTime() && (v.visitedAt || 0) < next.getTime()).length,
      cur: i === 0,
    });
  }
  const maxN = Math.max(...months.map(m => m.n), 1);
  html += `<div style="padding:0 16px">
    <div class="stats-hdr-row"><span class="stats-hdr-title">Date nights by month</span></div>
    <div class="week-chart">
      <div class="wc-val-row">${months.map(m => `<div class="wc-val">${m.n || ''}</div>`).join('')}</div>
      <div class="wc-chart-area">${months.map(m => `
        <div class="wc-bar${m.cur ? ' wc-current' : ''}" style="height:${Math.max(3, Math.round(m.n / maxN * 72))}px"></div>`).join('')}
      </div>
      <div class="wc-lbl-row">${months.map(m => `<div class="wc-lbl">${m.cur ? 'Now' : m.lbl}</div>`).join('')}</div>
    </div>
  </div>
  <div style="text-align:center;font-size:11px;color:var(--muted);padding:14px 32px 8px">Wheel follow-through counts spins from when tracking began — older spins weren't recorded.</div>`;
  return html;
}

/* ════════════════════════════════════════ CALENDAR TAB */
function renderCalendar(){
  document.getElementById('hdr').innerHTML = `
    <div class="flat-hdr">
      <div><div class="flat-hdr-title">Calendar</div><div class="flat-hdr-sub">${weekLabel(getWeekStart())}</div></div>
      <div class="flat-hdr-icon"><i data-lucide="calendar-days"></i></div>
    </div>`;

  const t = todayStr();
  const horizon = addDays(t, 13); // 2 weeks ahead
  const relevant = S.tasks.filter(x => x.dueDate >= addDays(t,-3) && x.dueDate <= horizon)
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate));

  const byDate = {};
  relevant.forEach(x => { (byDate[x.dueDate] = byDate[x.dueDate]||[]).push(x); });

  const diffColors = {Easy:'var(--green)', Medium:'var(--gold)', Hard:'var(--red)'};

  let html = `<div style="padding:14px 16px 0">
    <div class="gcal-notice">
      <i data-lucide="calendar-days"></i>
      <p>Tasks appear below. Tap <b style="color:var(--sky-deep)">Add to Google Calendar</b> on any task card to add it directly to your calendar.</p>
    </div>
  </div>`;

  const allDates = Object.keys(byDate).sort();
  if(!allDates.length){
    html += `<div class="empty-state"><i data-lucide="calendar-check"></i><p>No tasks in the next 2 weeks</p></div>`;
  }

  allDates.forEach(date => {
    const isToday = date === t;
    const tasks = byDate[date];
    html += `<div class="cal-day-card" ${isToday?'style="border:2px solid var(--sky);box-shadow:0 0 0 3px var(--sky-soft)"':''}>
      <div class="cal-day-lbl">
        ${isToday?'<div class="cal-today-dot"></div>':''}
        ${dayLabelFor(date)}${isToday?' · Today':''}
        &nbsp;<span style="font-weight:600;color:var(--muted)">${shortDateStr(date)}</span>
      </div>
      ${tasks.map(x => `<div class="cal-task-row">
        <div class="cal-dot" style="background:${diffColors[x.difficulty]||'var(--sky)'}"></div>
        <span class="cal-task-name">${x.name}</span>
        <span class="cal-badge-who">${x.assignee}</span>
        <span class="cal-diff" style="background:${diffColors[x.difficulty]+'22'||'var(--sky-soft)'};color:${diffColors[x.difficulty]||'var(--sky-deep)'}">${x.difficulty}</span>
      </div>`).join('')}
    </div>`;
  });

  setPanelHTML(html);
  lucide.createIcons();
}

/* ════════════════════════════════════════ DATES TAB */
// Deployed dates-fsq-proxy Worker (Foursquare Places API; see dates-fsq-proxy/)
const DATES_PROXY_URL = 'https://dates-fsq-proxy.zacfisherman.workers.dev';
const DEFAULT_BIAS = {lat:-37.8136, lon:144.9631, label:'Melbourne'};
// "Near" bias lives in synced state like everything else, so a suburb set
// on one phone survives app restarts (and shows up on the other phone).
function getBias(){ return (S.dates && S.dates.searchBias) || DEFAULT_BIAS; }
function setBias(b){ commitChange(state => { state.dates.searchBias = b; }); }
// Discover scope ('food' | 'experiences' | 'both') persists in synced state
// like the bias, so it survives app restarts.
function getScope(){ return (S.dates && S.dates.discoverScope) || 'both'; }
function setScope(v){ commitChange(state => { state.dates.discoverScope = v; }); }

// Suburb/postcode → coords through Foursquare's own `near` geocoder
// (the Worker reads the resolved centre out of the search response), so
// location bias needs no third-party geocoding service.
async function fsqLocate(q){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try{
    const d = await fetch(`${DATES_PROXY_URL}/geocode?q=${encodeURIComponent(q)}`, {signal:controller.signal}).then(r=>r.json());
    if(typeof d.lat === 'number' && typeof d.lon === 'number') return {lat:d.lat, lon:d.lon};
  }catch(e){}
  finally{ clearTimeout(timeoutId); }
  return null;
}

// Foursquare result → the shape the Dates tab stores and renders.
// rating is FSQ's 0–10 score (null when the org's Pro credits are spent —
// the Worker degrades to core fields instead of failing the search).
function normFsqPlace(p){
  return {
    fsqId: p.fsq_place_id || null,
    name: p.name || '',
    address: (p.location?.formatted_address || '').replace(/,?\s*Australia$/i, ''),
    rating: typeof p.rating === 'number' ? +p.rating.toFixed(1) : null,
    category: p.categories?.[0]?.name || '',
    highlyRated: !!p.highlyRated,
  };
}
// Duplicate check for a Foursquare place against a saved list: stable place
// ids when both sides have one (so two branches of the same chain are NOT
// duplicates), name matching as the fallback for entries saved before ids
// were stored.
function dateSpotKnown(p, list){
  return list.some(x => (x.fsqId && p.fsqId)
    ? x.fsqId === p.fsqId
    : normKey(x.name || '') === normKey(p.name || ''));
}
// Qualitative quality signal (see dates-fsq-proxy: derived from Foursquare's
// free server-side rating/popularity ORDER, never a faked number).
const BADGE_LABELS = {'top-rated':'Top rated nearby', 'trending':'Trending now', 'highly-rated':'Highly rated'};
function qualityChipHTML(p, cls){
  if(p.rating != null) return `<span class="${cls}">★ ${p.rating}</span>`;
  if(p.badge && BADGE_LABELS[p.badge]) return `<span class="${cls}">★ ${BADGE_LABELS[p.badge]}</span>`;
  return '';
}
function dateSpotIcon(cat){
  const c = (cat || '').toLowerCase();
  if(/museum|gallery|art|exhibit|historic|monument|memorial|castle|landmark/.test(c)) return 'landmark';
  if(/theater|theatre|concert|music|opera|amphi|jazz/.test(c)) return 'music';
  if(/cinema|movie/.test(c)) return 'clapperboard';
  if(/aquarium|zoo|wildlife/.test(c)) return 'fish';
  if(/bar|pub|brewery|winery|lounge|club|speakeasy/.test(c)) return 'martini';
  if(/caf|coffee|tea room|bakery|dessert|ice cream|gelato/.test(c)) return 'coffee';
  if(/casino|arcade|bowling|karaoke|golf|escape|games|amusement/.test(c)) return 'ticket';
  if(/restaurant|dining|food|steak|pizz|sushi|bistro|diner|eatery/.test(c)) return 'utensils';
  return 'map-pin';
}

function renderDates(){
  document.getElementById('hdr').innerHTML = `
    <div class="flat-hdr">
      <div><div class="flat-hdr-title">Date Night</div><div class="flat-hdr-sub">Find your next spot</div></div>
      <div class="flat-hdr-icon"><i data-lucide="heart"></i></div>
    </div>`;

  const toVisit = S.dates.toVisit;
  const visited = S.dates.visited;

  let html = `
    <div class="pick-row">
      <button class="pick-hero" id="pick-btn"><i data-lucide="dice-5"></i>Gamble Your Date</button>
      <button class="pick-practice" id="test-luck-btn" aria-label="Test your luck — practice spin, nothing counts">
        <i data-lucide="eye"></i><span>Practice</span>
      </button>
    </div>
    <div class="search-wrap-row">
      <div class="search-box">
        <i data-lucide="search"></i>
        <input class="search-input" id="date-search" placeholder="Restaurant, bar, gallery…" autocomplete="off">
      </div>
      <button class="discover-btn" id="discover-btn"><i data-lucide="compass"></i>Discover</button>
    </div>
    <div class="search-loc-bar">
      <i data-lucide="map-pin"></i>
      <span class="search-loc-lbl">Near</span>
      <input class="search-loc-input" id="loc-input" placeholder="Suburb or postcode" value="${escapeHtml(getBias().label)}" autocomplete="off">
    </div>
    <div id="search-results-panel" class="search-results-panel"></div>`;

  // To Visit
  html += `<div class="sec-row"><div class="sec-title">To Visit</div><span class="sec-count">${toVisit.length} places</span></div>`;
  if(!toVisit.length){
    html += `<div class="empty-state" style="padding:20px 24px"><i data-lucide="map-pin"></i><p>Search above or tap Discover to build your list</p></div>`;
  } else {
    toVisit.forEach(p => { html += toVisitCard(p); });
  }

  // Visited
  if(visited.length){
    html += `<div class="sec-row"><div class="sec-title">Visited</div>
      <button class="export-btn" id="export-btn" style="width:auto;border:none;background:none;box-shadow:none;padding:0;font-size:13px"><i data-lucide="download"></i>Export</button></div>`;
    visited.forEach(p => { html += visitedCard(p); });
  }

  setPanelHTML(html);
  lucide.createIcons();

  // Gamble Your Date — spin wheel
  document.getElementById('pick-btn').onclick = () => {
    if(!toVisit.length){ alert('Add some places to visit first!'); return; }
    openWheelOverlay(toVisit);
  };
  document.getElementById('test-luck-btn').onclick = () => {
    if(!toVisit.length){ alert('Add some places to visit first!'); return; }
    openWheelOverlay(toVisit, true);
  };

  // Venue search
  let timer;
  document.getElementById('date-search').addEventListener('input', e => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if(q.length < 2){ document.getElementById('search-results-panel').style.display='none'; return; }
    timer = setTimeout(() => fsqSearch(q), 380);
  });

  // Discover swipe deck
  document.getElementById('discover-btn').onclick = openDiscoverDeck;

  // Location bias — suburb or postcode
  let locTimer;
  document.getElementById('loc-input').addEventListener('input', e => {
    clearTimeout(locTimer);
    const q = e.target.value.trim();
    if(!q){ setBias(DEFAULT_BIAS); return; }
    locTimer = setTimeout(async () => {
      const coords = await fsqLocate(q);
      if(coords) setBias({...coords, label:q});
      const sq = document.getElementById('date-search')?.value.trim();
      if(sq && sq.length >= 2) fsqSearch(sq);
    }, 600);
  });

  // Mark visited
  document.querySelectorAll('[data-visit-it]').forEach(btn => btn.addEventListener('click', () => {
    openRateSheet(btn.dataset.visitIt);
  }));
  // Del to-visit
  document.querySelectorAll('[data-del-place]').forEach(btn => btn.addEventListener('click', () => {
    const placeId = btn.dataset.delPlace;
    commitChange(state => { state.dates.toVisit = state.dates.toVisit.filter(p=>p.id!==placeId); });
    renderDates();
  }));
  // Del visited
  document.querySelectorAll('[data-del-visited]').forEach(btn => btn.addEventListener('click', () => {
    const placeId = btn.dataset.delVisited;
    commitChange(state => { state.dates.visited = state.dates.visited.filter(p=>p.id!==placeId); });
    renderDates();
  }));
  // Maps links
  document.querySelectorAll('[data-maps]').forEach(el => el.addEventListener('click', () => {
    window.open('https://maps.google.com/?q='+encodeURIComponent(el.dataset.maps), '_blank');
  }));
  // Google search links — interim photos/reviews lookup without hosting or
  // paying for that data (Foursquare photos are Premium-tier)
  document.querySelectorAll('[data-gsearch]').forEach(el => el.addEventListener('click', () => {
    window.open('https://www.google.com/search?q='+encodeURIComponent(el.dataset.gsearch), '_blank');
  }));

  const expBtn = document.getElementById('export-btn');
  if(expBtn) expBtn.onclick = exportVisited;
}

function toVisitCard(p){
  const mapsQ = escapeHtml(`${p.name} ${p.address||''}`.trim());
  return `<div class="date-card${p.picked?' picked-highlight':''}">
    ${p.picked ? '<div class="picked-tag"><i data-lucide="star"></i>Next Date!</div>' : ''}
    <div class="date-top">
      <div class="date-icon pending-icon"><i data-lucide="${p.category ? dateSpotIcon(p.category) : 'utensils'}"></i></div>
      <div class="date-info">
        <div class="date-name">${escapeHtml(p.name)}</div>
        ${p.address ? `<div class="date-addr-link" data-maps="${mapsQ}"><i data-lucide="map-pin"></i>${escapeHtml(p.address)}</div>` : ''}
        ${qualityChipHTML(p, 'date-quality')}
      </div>
    </div>
    <div class="date-actions">
      <button class="date-act visited-act" data-visit-it="${p.id}"><i data-lucide="star"></i>Mark visited</button>
      <button class="date-act" data-gsearch="${mapsQ}"><i data-lucide="search"></i>Google</button>
      <button class="date-act del-act" data-del-place="${p.id}"><i data-lucide="trash-2"></i>Remove</button>
    </div>
  </div>`;
}
function visitedCard(p){
  const mapsQ = escapeHtml(`${p.name} ${p.address||''}`.trim());
  const stars = [1,2,3,4,5].map(n =>
    `<svg class="${n<=p.rating?'star-filled':'star-empty'}" viewBox="0 0 24 24" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
  ).join('');
  return `<div class="date-card">
    <div class="date-top">
      <div class="date-icon visited-icon"><i data-lucide="${p.category ? dateSpotIcon(p.category) : 'check-circle-2'}"></i></div>
      <div class="date-info">
        <div class="date-name">${escapeHtml(p.name)}</div>
        ${p.address ? `<div class="date-addr-link" data-maps="${mapsQ}"><i data-lucide="map-pin"></i>${escapeHtml(p.address)}</div>` : ''}
        <div class="date-stars">${stars}</div>
        ${qualityChipHTML({rating: p.fsqRating ?? null, badge: p.badge}, 'date-quality')}
        ${p.notes ? `<div class="date-notes-text">"${escapeHtml(p.notes)}"</div>` : ''}
        ${p.visitedAt ? `<div class="date-visited-on">Visited ${new Date(p.visitedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</div>` : ''}
      </div>
    </div>
    <div class="date-actions">
      <button class="date-act" data-gsearch="${mapsQ}"><i data-lucide="search"></i>Google</button>
      <button class="date-act del-act" data-del-visited="${p.id}"><i data-lucide="trash-2"></i>Remove</button>
    </div>
  </div>`;
}

async function fsqSearch(q){
  const panel = document.getElementById('search-results-panel'); if(!panel) return;
  panel.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-weight:600;font-size:14px">Searching…</div>';
  panel.style.display = 'block';
  // Without a timeout, a slow/unreachable API leaves this panel stuck on
  // "Searching…" forever with no way to tell a failure from "still loading".
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try{
    // Bias toward user's chosen suburb/postcode; default is Melbourne CBD
    const {lat, lon} = getBias();
    const res = await fetch(`${DATES_PROXY_URL}/search?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lon}`, {signal:controller.signal});
    const data = await res.json();
    clearTimeout(timeoutId);
    if(!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
    const places = (data.results || []).map(normFsqPlace).filter(p => p.name);
    if(!places.length){
      panel.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-weight:600;font-size:14px">No nearby results found</div>';
      return;
    }
    panel.innerHTML = places.map((p,i) => `
      <div class="search-result-row" data-idx="${i}">
        <i data-lucide="${dateSpotIcon(p.category)}"></i>
        <div style="flex:1;min-width:0">
          <div class="sr-name">${escapeHtml(p.name)}</div>
          ${p.address || p.category ? `<div class="sr-addr">${escapeHtml([p.category, p.address].filter(Boolean).join(' · '))}</div>` : ''}
        </div>
        ${p.highlyRated && p.rating == null ? `<span class="sr-rating">★ Highly rated</span>` : p.rating != null ? `<span class="sr-rating">★ ${p.rating}</span>` : ''}
      </div>`).join('');
    lucide.createIcons();
    panel.querySelectorAll('.search-result-row').forEach((el,i) => {
      el.addEventListener('click', () => {
        const p = places[i];
        if(!dateSpotKnown(p, S.dates.toVisit)){
          const newId = uid(), addedAt = Date.now();
          const badge = p.rating == null && p.highlyRated ? 'highly-rated' : null;
          commitChange(state => {
            if(dateSpotKnown(p, state.dates.toVisit)) return; // re-check against fresh state too
            state.dates.toVisit.push({id:newId, fsqId:p.fsqId, name:p.name, address:p.address, rating:p.rating, badge, category:p.category, addedAt, picked:false});
          });
        }
        panel.style.display='none';
        document.getElementById('date-search').value='';
        renderDates();
      });
    });
  }catch(e){
    clearTimeout(timeoutId);
    const timedOut = e.name === 'AbortError';
    panel.innerHTML = `
      <div style="padding:14px 14px 10px;text-align:center;color:var(--muted);font-weight:600;font-size:14px">
        ${timedOut ? "Couldn't reach search — check your connection" : escapeHtml(e.message || 'No results found')}
      </div>
      ${timedOut ? '<button class="export-btn" id="search-retry-btn" style="margin:0 14px 14px;width:calc(100% - 28px)"><i data-lucide="refresh-cw"></i>Try again</button>' : ''}`;
    if(timedOut){
      lucide.createIcons();
      document.getElementById('search-retry-btn')?.addEventListener('click', () => fsqSearch(q));
    }
  }
}

/* ── Discover: swipe deck / compact list of date spots near the bias ── */
async function openDiscoverDeck(){
  document.getElementById('discover-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'discover-overlay';
  ov.innerHTML = `
    <button id="dv-close">&#x2715;</button>
    <div class="dv-title">Discover</div>
    <div class="dv-sub">Date spots near ${escapeHtml(getBias().label)}</div>
    <div class="dv-controls">
      <div class="dv-sort">
        <button class="dv-chip sel" data-dv-sort="RATING">Best rated</button>
        <button class="dv-chip" data-dv-sort="POPULARITY">Trending now</button>
      </div>
      <div class="dv-view">
        <button class="dv-vbtn sel" data-dv-view="swipe" aria-label="One at a time"><i data-lucide="layers"></i></button>
        <button class="dv-vbtn" data-dv-view="list" aria-label="Compact list"><i data-lucide="list"></i></button>
      </div>
    </div>
    <div class="dv-scope">
      <button class="dv-chip${getScope()==='food'?' sel':''}" data-dv-scope="food">Food &amp; Drink</button>
      <button class="dv-chip${getScope()==='experiences'?' sel':''}" data-dv-scope="experiences">Experiences</button>
      <button class="dv-chip${getScope()==='both'?' sel':''}" data-dv-scope="both">Both</button>
    </div>
    <div id="dv-stage"><div class="dv-msg">Finding spots…</div></div>
    <div class="dv-btns" id="dv-btns" style="display:none">
      <button class="dv-act dv-skip" id="dv-skip" aria-label="Skip"><i data-lucide="x"></i></button>
      <button class="dv-act dv-add" id="dv-add" aria-label="Add to list"><i data-lucide="heart"></i></button>
    </div>`;
  document.body.appendChild(ov);
  lucide.createIcons();
  const close = ()=>{ ov.remove(); renderDates(); };
  document.getElementById('dv-close').onclick = close;

  const stage = document.getElementById('dv-stage');
  let sortMode = 'RATING';   // 'RATING' (Best rated) | 'POPULARITY' (Trending now)
  let view = 'swipe';        // 'swipe' | 'list'
  const decks = {};          // cache per sort+scope combination: key → {cards, idx}
  const deckKey = ()=> sortMode + '|' + getScope();

  async function loadDeck(){
    if(decks[deckKey()]) return;
    stage.innerHTML = '<div class="dv-msg">Finding spots…</div>';
    document.getElementById('dv-btns').style.display = 'none';
    const {lat, lon} = getBias();
    const res = await fetch(`${DATES_PROXY_URL}/discover?lat=${lat}&lon=${lon}&limit=40&sort=${sortMode}&scope=${getScope()}`);
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || `Discover failed (${res.status})`);
    // skip anything already on either list, and dedupe within the deck
    const knownList = [...S.dates.toVisit, ...S.dates.visited];
    const cards = (data.results || []).map(normFsqPlace)
      .filter(p => p.name && !dateSpotKnown(p, knownList))
      .filter((p, i, arr) => arr.findIndex(x =>
        (x.fsqId && p.fsqId) ? x.fsqId === p.fsqId : normKey(x.name) === normKey(p.name)) === i);
    // The response order IS Foursquare's real rating/popularity ranking
    // (free even though the numeric rating field is Pro-gated), so the top
    // slice earns an honest qualitative badge — never an invented number.
    const badge = sortMode === 'POPULARITY' ? 'trending' : 'top-rated';
    cards.slice(0, Math.max(3, Math.ceil(cards.length * 0.2))).forEach(p => { p.badge = badge; });
    decks[deckKey()] = {cards, idx: 0};
  }

  // Text-forward card: no photo, and no photo-shaped hole either — a small
  // icon badge in a type-led layout reads as designed, not as a failed image.
  function cardHTML(p, top){
    return `<div class="dv-card${top ? ' top' : ''}">
      <span class="dv-stamp dv-stamp-add">Add</span>
      <span class="dv-stamp dv-stamp-skip">Skip</span>
      <div class="dv-badge"><i data-lucide="${dateSpotIcon(p.category)}"></i></div>
      <div class="dv-name">${escapeHtml(p.name)}</div>
      <div class="dv-meta">
        ${p.category ? `<span class="dv-cat">${escapeHtml(p.category)}</span>` : ''}
        ${qualityChipHTML(p, 'dv-rating')}
      </div>
      ${p.address ? `<div class="dv-addr"><i data-lucide="map-pin"></i>${escapeHtml(p.address)}</div>` : ''}
      <button class="dv-gsearch" data-gsearch="${escapeHtml(`${p.name} ${p.address || ''}`.trim())}" aria-label="Search on Google"><i data-lucide="search"></i></button>
    </div>`;
  }
  function rowHTML(p, i){
    const added = dateSpotKnown(p, S.dates.toVisit);
    return `<div class="dv-row">
      <div class="dv-row-ic"><i data-lucide="${dateSpotIcon(p.category)}"></i></div>
      <div class="dv-row-info">
        <div class="dv-row-name">${escapeHtml(p.name)} ${qualityChipHTML(p, 'dv-row-chip')}</div>
        <div class="dv-row-sub">${escapeHtml([p.category, p.address].filter(Boolean).join(' · '))}</div>
      </div>
      <button class="dv-row-add${added ? ' on' : ''}" data-dv-row="${i}" aria-label="${added ? 'Added' : 'Add to list'}">
        <i data-lucide="${added ? 'check' : 'plus'}"></i>
      </button>
    </div>`;
  }
  function addPlace(p){
    if(dateSpotKnown(p, S.dates.toVisit)) return;
    const newId = uid(), addedAt = Date.now();
    commitChange(state => {
      if(dateSpotKnown(p, state.dates.toVisit)) return;
      state.dates.toVisit.push({id:newId, fsqId:p.fsqId, name:p.name, address:p.address, rating:p.rating, badge:p.badge || null, category:p.category, addedAt, picked:false});
    });
  }

  function render(){
    const d = decks[deckKey()];
    if(!d) return; // still loading — loadDeck's caller renders when ready
    stage.classList.toggle('listing', view === 'list');
    if(!d.cards.length){
      document.getElementById('dv-btns').style.display = 'none';
      stage.innerHTML = `<div class="dv-msg">Nothing new nearby — everything here is already on your lists!</div>`;
      return;
    }
    if(view === 'list'){
      document.getElementById('dv-btns').style.display = 'none';
      stage.innerHTML = d.cards.map(rowHTML).join('');
      lucide.createIcons();
      stage.querySelectorAll('[data-dv-row]').forEach(btn => btn.addEventListener('click', ()=>{
        addPlace(d.cards[+btn.dataset.dvRow]);
        btn.classList.add('on');
        btn.innerHTML = '<i data-lucide="check"></i>';
        btn.setAttribute('aria-label', 'Added');
        lucide.createIcons();
      }));
      return;
    }
    document.getElementById('dv-btns').style.display = d.idx < d.cards.length ? 'flex' : 'none';
    if(d.idx >= d.cards.length){
      stage.innerHTML = `<div class="dv-msg">That's the lot nearby!<br>Try the other sort, or change the "Near" suburb.</div>`;
      return;
    }
    stage.innerHTML = (d.idx + 1 < d.cards.length ? cardHTML(d.cards[d.idx+1], false) : '') + cardHTML(d.cards[d.idx], true);
    lucide.createIcons();
    const topCard = stage.querySelector('.dv-card.top');
    topCard.querySelector('.dv-gsearch').addEventListener('click', e => {
      window.open('https://www.google.com/search?q='+encodeURIComponent(e.currentTarget.dataset.gsearch), '_blank');
    });
    bindSwipe(topCard, liked => {
      if(liked) addPlace(d.cards[d.idx]);
      d.idx++;
      render();
    });
  }
  // Swipe right = add, left = skip; buttons fling the card the same way.
  function bindSwipe(card, onDone){
    if(!card) return;
    let sx=0, sy=0, dx=0, dy=0, active=false, done=false;
    const stampAdd = card.querySelector('.dv-stamp-add');
    const stampSkip = card.querySelector('.dv-stamp-skip');
    const fling = liked => {
      if(done) return; done = true;
      const dir = liked ? 1 : -1;
      card.style.transition = 'transform .3s ease, opacity .3s ease';
      card.style.transform = `translate(${dir*window.innerWidth}px, ${dy*0.3}px) rotate(${dir*16}deg)`;
      card.style.opacity = '0';
      setTimeout(()=> onDone(liked), 230);
    };
    card.addEventListener('pointerdown', e => {
      // the Google button must receive its own click — capturing here
      // would swallow it and start a drag instead
      if(e.target.closest('.dv-gsearch')) return;
      active = true; sx = e.clientX; sy = e.clientY;
      card.setPointerCapture(e.pointerId);
      card.style.transition = 'none';
    });
    card.addEventListener('pointermove', e => {
      if(!active || done) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      card.style.transform = `translate(${dx}px, ${dy*0.3}px) rotate(${dx*0.05}deg)`;
      const q = Math.min(Math.abs(dx)/90, 1);
      stampAdd.style.opacity = dx > 0 ? q : 0;
      stampSkip.style.opacity = dx < 0 ? q : 0;
    });
    const release = ()=>{
      if(!active || done) return;
      active = false;
      if(Math.abs(dx) > 90){ fling(dx > 0); return; }
      card.style.transition = 'transform .25s ease';
      card.style.transform = '';
      stampAdd.style.opacity = 0; stampSkip.style.opacity = 0;
      dx = 0; dy = 0;
    };
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
    document.getElementById('dv-add').onclick = ()=> fling(true);
    document.getElementById('dv-skip').onclick = ()=> fling(false);
  }

  async function loadAndRender(){
    try{ await loadDeck(); render(); }
    catch(e){
      document.getElementById('dv-btns').style.display = 'none';
      stage.innerHTML = `<div class="dv-msg">${escapeHtml(e.message || "Couldn't load suggestions")}</div>`;
    }
  }
  ov.querySelectorAll('[data-dv-sort]').forEach(el => el.addEventListener('click', ()=>{
    if(el.dataset.dvSort === sortMode) return;
    sortMode = el.dataset.dvSort;
    ov.querySelectorAll('[data-dv-sort]').forEach(e => e.classList.toggle('sel', e === el));
    loadAndRender();
  }));
  ov.querySelectorAll('[data-dv-view]').forEach(el => el.addEventListener('click', ()=>{
    if(el.dataset.dvView === view) return;
    view = el.dataset.dvView;
    ov.querySelectorAll('[data-dv-view]').forEach(e => e.classList.toggle('sel', e === el));
    render();
  }));
  ov.querySelectorAll('[data-dv-scope]').forEach(el => el.addEventListener('click', ()=>{
    if(el.dataset.dvScope === getScope()) return;
    setScope(el.dataset.dvScope); // persisted like the Near bias
    ov.querySelectorAll('[data-dv-scope]').forEach(e => e.classList.toggle('sel', e === el));
    loadAndRender();
  }));
  loadAndRender();
}

/* ── Spinning wheel overlay ──────────────────── */
function fireConfetti(){
  const colors = ['#2BC2F2','#F7B500','#28C26E','#FF4757','#A855F7','#ffffff'];
  const cx = window.innerWidth/2, cy = window.innerHeight/3;
  for(let i=0;i<44;i++){
    const el = document.createElement('div');
    el.className='confetti-dot';
    const angle = Math.random()*2*Math.PI;
    const dist  = 80 + Math.random()*220;
    const size  = 6+Math.random()*7;
    el.style.cssText=`left:${cx+Math.random()*30-15}px;top:${cy+Math.random()*30-15}px;`+
      `width:${size}px;height:${size}px;`+
      `background:${colors[Math.floor(Math.random()*colors.length)]};`+
      `--tx:${Math.cos(angle)*dist}px;--ty:${Math.sin(angle)*dist+60}px;`+
      `animation-delay:${Math.random()*0.25}s;border-radius:${Math.random()>.5?'50%':'2px'}`;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 2000);
  }
}
function openWheelOverlay(places, practice=false){
  document.getElementById('wheel-overlay')?.remove();
  if(!places.length) return;
  const size = Math.min(window.innerWidth-32, 300);
  const ov = document.createElement('div');
  ov.id='wheel-overlay';
  ov.innerHTML=`
    <button id="wheel-dismiss-btn">&#x2715;</button>
    <div class="wh-title">${practice ? 'Just practicing…' : 'Asking the stars…'}</div>
    <div class="wheel-wrap">
      <div class="wheel-ptr" id="wheel-ptr"></div>
      <canvas id="wcanvas" width="${size}" height="${size}"></canvas>
    </div>
    <button class="wheel-cancel" id="wheel-cancel-btn">Cancel spin</button>`;
  document.body.appendChild(ov);

  const canvas = document.getElementById('wcanvas');
  const ctx = canvas.getContext('2d');
  const ptr = document.getElementById('wheel-ptr');
  const n = places.length;
  const cx = size/2, cy = size/2, r = size/2 - 4;
  const seg = (2*Math.PI)/n;
  const TAU = 2*Math.PI;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Theme-aware palettes: the DEFAULT wheel is the light "casino" look —
  // jewel-tone segments, gold rim/pointer, glossy highlight. The original
  // dark, moody navy/violet wheel lives on as the dark-mode variant.
  const isDarkWheel = document.documentElement.dataset.theme === 'dark';
  const WHEEL = isDarkWheel ? {
    segs: ['#1C2434','#242F45'],
    segStroke: 'rgba(255,255,255,.07)',
    label: '#C3D0E2', labelWin: '#F7F4FF',
    winA: '#8B6CF0', winB: '#B69CFF', glowRGB: '160,128,255',
    rim: 'rgba(255,255,255,.10)', rimW: 2,
    hub: '#10131C', hubRing: 'rgba(182,156,255,.55)', hubDot: 'rgba(182,156,255,.9)',
    gloss: 0,
  } : {
    segs: ['#D8484F','#1D9E6E','#2F63C9','#8B5CF6'], // ruby · emerald · sapphire · amethyst
    segStroke: 'rgba(255,255,255,.35)',
    label: '#FFFFFF', labelWin: '#4A3200',
    winA: '#F6CE58', winB: '#DBA321', glowRGB: '218,166,32',
    rim: '#D9AE45', rimW: 4,
    hub: '#FFF7E6', hubRing: '#D9AE45', hubDot: '#C99722',
    gloss: 1,
  };
  function segColor(i){
    let c = WHEEL.segs[i % WHEEL.segs.length];
    // avoid the last segment matching the first across the seam
    if(i === n-1 && n > 1 && c === WHEEL.segs[0]) c = WHEEL.segs[1 % WHEEL.segs.length];
    return c;
  }
  // hl: index of the winning segment to highlight; glow: 0..1 pulse strength
  function drawWheel(rot, hl=-1, glow=0){
    ctx.clearRect(0,0,size,size);
    for(let i=0;i<n;i++){
      const sa = rot + i*seg - Math.PI/2;
      const isWin = i===hl;
      ctx.save();
      if(isWin && glow>0){
        ctx.shadowColor = `rgba(${WHEEL.glowRGB},${(0.85*glow).toFixed(2)})`;
        ctx.shadowBlur = 30*glow;
      }
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,sa,sa+seg);
      ctx.closePath();
      if(isWin){
        const g = ctx.createLinearGradient(0,0,size,size);
        g.addColorStop(0,WHEEL.winA); g.addColorStop(1,WHEEL.winB);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = segColor(i);
      }
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,sa,sa+seg);
      ctx.closePath();
      ctx.strokeStyle=WHEEL.segStroke;
      ctx.lineWidth=1;
      ctx.stroke();
      // label
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(rot+(i+.5)*seg - Math.PI/2);
      ctx.textAlign='right';
      ctx.fillStyle = isWin ? WHEEL.labelWin : WHEEL.label;
      const fs=Math.max(9,Math.min(13,170/n));
      ctx.font=`600 ${fs}px -apple-system,BlinkMacSystemFont,sans-serif`;
      if(WHEEL.gloss){ ctx.shadowColor='rgba(0,0,0,.35)'; ctx.shadowBlur=3; }
      const lbl=places[i].name.length>15?places[i].name.slice(0,13)+'…':places[i].name;
      ctx.fillText(lbl,r-12,fs/3);
      ctx.restore();
    }
    // glossy sheen (casino variant): soft top-left highlight over the face
    if(WHEEL.gloss){
      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.clip();
      const sheen = ctx.createRadialGradient(cx - r*0.45, cy - r*0.55, r*0.1, cx, cy, r*1.15);
      sheen.addColorStop(0,'rgba(255,255,255,.30)');
      sheen.addColorStop(0.45,'rgba(255,255,255,.06)');
      sheen.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0,0,size,size);
      ctx.restore();
      // brass inner ring just inside the rim
      ctx.beginPath();
      ctx.arc(cx,cy,r-5,0,TAU);
      ctx.strokeStyle='rgba(255,244,214,.55)';
      ctx.lineWidth=1.5;
      ctx.stroke();
    }
    // outer rim
    ctx.beginPath();
    ctx.arc(cx,cy,r,0,TAU);
    ctx.strokeStyle=WHEEL.rim;
    ctx.lineWidth=WHEEL.rimW;
    ctx.stroke();
    // center hub
    ctx.beginPath();
    ctx.arc(cx,cy,15,0,TAU);
    ctx.fillStyle=WHEEL.hub;
    ctx.fill();
    ctx.strokeStyle=WHEEL.hubRing;
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx,cy,4,0,TAU);
    ctx.fillStyle=WHEEL.hubDot;
    ctx.fill();
  }

  const winIdx = Math.floor(Math.random()*n);
  // target: winner's mid at top (pointer). mid of seg i = rot + i*seg + seg/2 - PI/2 = 0
  // -> rot = -i*seg - seg/2 + 2PI*k  (add 5 extra full rotations)
  const finalRot = 5*TAU - winIdx*seg - seg/2;
  // Overshoot past the pointer, then wobble back — a wheel with weight,
  // not a linear spinner. Capped so it can't visually land on a neighbor.
  const OVER = reduceMotion ? 0 : Math.min(seg*0.22, 0.15);
  // 12s of motion overall — long enough to change your mind and cancel.
  const SPIN_MS   = reduceMotion ? 500 : 10500;
  const WOBBLE_MS = reduceMotion ? 0 : 800;
  const PULSE_MS  = reduceMotion ? 250 : 700;

  // Pointer flick every time a segment boundary passes underneath.
  let lastIdx = -1, lastFlick = 0;
  function tickPointer(rot, ts){
    const idx = Math.floor((((-rot) % TAU) + TAU) % TAU / seg);
    if(idx !== lastIdx){
      lastIdx = idx;
      if(!reduceMotion && ts - lastFlick > 50){
        lastFlick = ts;
        ptr.style.transition = 'none';
        ptr.style.transform = 'translateX(-50%) rotate(-15deg)';
        requestAnimationFrame(()=>{
          ptr.style.transition = 'transform 130ms cubic-bezier(.2,.8,.3,1.5)';
          ptr.style.transform = 'translateX(-50%) rotate(0deg)';
        });
      }
    }
  }

  function easeOut(t){ return 1-Math.pow(1-t,3.1); }
  let startTime = null;
  let cancelled = false;

  function animate(ts){
    if(cancelled) return; // cancelled mid-spin: nothing lands, nothing logs
    if(!startTime) startTime = ts;
    const el = ts - startTime;
    if(el <= SPIN_MS){
      const rot = easeOut(el/SPIN_MS)*(finalRot + OVER);
      drawWheel(rot);
      tickPointer(rot, ts);
      requestAnimationFrame(animate);
    } else if(el <= SPIN_MS + WOBBLE_MS){
      // damped swing around the true landing point
      const q = (el - SPIN_MS)/WOBBLE_MS;
      const rot = finalRot + OVER*Math.cos(Math.PI*1.9*q)*Math.exp(-3.4*q);
      drawWheel(rot);
      tickPointer(rot, ts);
      requestAnimationFrame(animate);
    } else if(el <= SPIN_MS + WOBBLE_MS + PULSE_MS){
      // landed: pointer springs once, winning segment pulses
      if(!ptr.classList.contains('land')){
        ptr.classList.add('land');
        document.getElementById('wheel-cancel-btn')?.remove(); // too late to cancel
      }
      const q = (el - SPIN_MS - WOBBLE_MS)/PULSE_MS;
      const glow = Math.abs(Math.sin(Math.PI*2*q)) * (1-q*0.35);
      drawWheel(finalRot, winIdx, Math.max(glow, 0.25));
      requestAnimationFrame(animate);
    } else {
      drawWheel(finalRot, winIdx, 0.55);
      spinDone(places[winIdx]);
    }
  }
  drawWheel(0);
  setTimeout(()=>requestAnimationFrame(animate), 250);

  const cancelSpin = ()=>{ cancelled = true; ov.remove(); renderDates(); };
  document.getElementById('wheel-dismiss-btn').onclick = cancelSpin;
  document.getElementById('wheel-cancel-btn').onclick = cancelSpin;

  function spinDone(winner){
    fireConfetti();
    if(practice){
      // "Test your luck": nothing is logged, nothing is picked, no follow-up.
      setTimeout(()=>{
        ov.remove();
        openModal(`
          <div class="mbox-icon" style="background:var(--gold-soft)"><i data-lucide="dice-5" style="color:var(--gold)"></i></div>
          <div class="mbox-title">${escapeHtml(winner.name)}</div>
          <div class="mbox-sub">…is what it would've landed on. Just practice — nothing was picked or counted.</div>
          <div class="mbox-btns">
            <button class="mbox-btn" id="wp-close"><i data-lucide="x"></i>Close</button>
            <button class="mbox-btn primary-btn" id="wp-real"><i data-lucide="dice-5"></i>Spin for real</button>
          </div>`,
        ()=>{
          document.getElementById('wp-close').onclick = closeModal;
          document.getElementById('wp-real').onclick = ()=>{ closeModal(); openWheelOverlay(S.dates.toVisit); };
        });
      }, 700);
      return;
    }
    commitChange(state => {
      state.dates.wheelLog = state.dates.wheelLog || [];
      // a re-spin while an earlier pick is still undecided marks it
      // superseded — "changed our minds", not "never went"
      const seen = new Set((state.dates.visited || []).map(v => normKey(v.name || '')));
      state.dates.wheelLog.forEach(w => {
        if(wheelPickStatus(w, seen) === 'pending') w.status = 'superseded';
      });
      state.dates.wheelLog.push({name: winner.name, at: Date.now(), status: 'pending'});
      if(state.dates.wheelLog.length > 300) state.dates.wheelLog = state.dates.wheelLog.slice(-300);
      state.dates.toVisit.forEach(p=>p.picked=false);
      const wi = state.dates.toVisit.findIndex(p=>p.id===winner.id);
      if(wi>0){ const [w]=state.dates.toVisit.splice(wi,1); state.dates.toVisit.unshift(w); }
      if(state.dates.toVisit.length) state.dates.toVisit[0].picked=true;
    });
    setTimeout(()=>{
      ov.remove();
      renderDates();
      const mapsQ=`${winner.name} ${winner.address||''}`.trim();
      const mapsUrl=`https://maps.google.com/?q=${encodeURIComponent(mapsQ)}`;
      openModal(`
        <div class="mbox-icon luck-pulse" style="background:var(--luck-soft)"><i data-lucide="star" style="color:var(--luck)"></i></div>
        <div class="mbox-title">${escapeHtml(winner.name)}</div>
        <div style="text-align:center;margin-bottom:14px"><span style="display:inline-flex;align-items:center;gap:5px;background:var(--luck-soft);color:var(--luck);border-radius:var(--r-pill);padding:4px 12px;font-size:12px;font-weight:600"><svg viewBox="0 0 24 24" width="13" height="13" fill="var(--luck)" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Next Date!</span></div>
        ${winner.address?`<div class="mbox-addr" data-maps="${escapeHtml(mapsQ)}"><i data-lucide="map-pin"></i>${escapeHtml(winner.address)}</div>`:''}
        <div class="mbox-btns">
          <button class="mbox-btn" id="wr-again-modal"><i data-lucide="shuffle"></i>Pick Again</button>
          <button class="mbox-btn primary-btn" id="wr-go-modal"><i data-lucide="map-pin"></i>Let's go!</button>
        </div>`,
      ()=>{
        document.getElementById('wr-go-modal').onclick=()=>{ window.open(mapsUrl,'_blank'); closeModal(); };
        document.getElementById('wr-again-modal').onclick=()=>{ closeModal(); openWheelOverlay(S.dates.toVisit); };
        document.querySelectorAll('[data-maps]').forEach(el=>el.addEventListener('click',()=>
          window.open('https://maps.google.com/?q='+encodeURIComponent(el.dataset.maps),'_blank')
        ));
      });
    }, 700);
  }
}
function showPickModal(p){
  const mapsQ = `${p.name} ${p.address||''}`.trim();
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(mapsQ)}`;
  openModal(`
    <div class="mbox-icon"><i data-lucide="heart"></i></div>
    <div class="mbox-title">${p.name}</div>
    <div class="mbox-sub">Next Date!</div>
    ${p.address ? `<div class="mbox-addr" data-maps="${mapsQ}"><i data-lucide="map-pin"></i>${p.address}</div>` : ''}
    <div class="mbox-btns">
      <button class="mbox-btn" id="pick-again"><i data-lucide="shuffle"></i>Pick Again</button>
      <button class="mbox-btn primary-btn" id="lets-go"><i data-lucide="map-pin"></i>Let's go!</button>
    </div>`,
  ()=>{
    document.getElementById('lets-go').onclick = () => { window.open(mapsUrl,'_blank'); closeModal(); };
    document.getElementById('pick-again').onclick = () => {
      closeModal();
      const others = S.dates.toVisit.filter(x=>x.id!==p.id);
      if(!others.length){ alert('Only one place in your list!'); return; }
      const next = others[Math.floor(Math.random()*others.length)];
      S.dates.toVisit.forEach(x=>x.picked=false);
      next.picked=true;
      const idx = S.dates.toVisit.findIndex(x=>x.id===next.id);
      if(idx>0){ S.dates.toVisit.splice(idx,1); S.dates.toVisit.unshift(next); }
      save(); showPickModal(next);
    };
    document.querySelectorAll('[data-maps]').forEach(el => el.addEventListener('click', ()=>
      window.open('https://maps.google.com/?q='+encodeURIComponent(el.dataset.maps),'_blank')
    ));
  });
}

function openRateSheet(placeId){
  const place = S.dates.toVisit.find(p=>p.id===placeId); if(!place) return;
  let rating = 0;
  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">Rate visit</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <div style="text-align:center;font-family:var(--disp);font-size:18px;font-weight:600;color:var(--ink);padding:4px 0">${escapeHtml(place.name)}</div>
    <div class="star-row">${[1,2,3,4,5].map(n=>`<button class="star-btn" data-star="${n}"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>`).join('')}</div>
    <textarea class="modal-notes" id="visit-notes" placeholder="How was it? (optional)…"></textarea>
    <button class="btn-primary" id="save-visit"><i data-lucide="check"></i>Save</button>`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    document.querySelectorAll('[data-star]').forEach(btn => btn.addEventListener('click', ()=>{
      rating = +btn.dataset.star;
      document.querySelectorAll('[data-star]').forEach(b=>{
        b.className='star-btn'+(+b.dataset.star<=rating?' on':'');
      });
    }));
    document.getElementById('save-visit').onclick = ()=>{
      const notes = document.getElementById('visit-notes').value.trim();
      const newId = uid(), visitedAt = Date.now();
      commitChange(state => {
        const p = state.dates.toVisit.find(p=>p.id===placeId);
        // follow-through: a pending wheel pick for this place is now honoured
        (state.dates.wheelLog || []).forEach(w => {
          if(!w.status || w.status === 'pending'){
            if(normKey(w.name || '') === normKey((p ? p.name : place.name) || '')) w.status = 'visited';
          }
        });
        state.dates.toVisit = state.dates.toVisit.filter(p=>p.id!==placeId);
        const src = p || place;
        state.dates.visited.unshift({
          id:newId, name:src.name, address:src.address,
          category: src.category || '',
          fsqId: src.fsqId || null,
          // rating below is the user's own stars; Foursquare's score and the
          // quality badge travel under their own names
          fsqRating: src.rating ?? null,
          badge: src.badge || null,
          rating, notes, visitedAt
        });
      });
      closeSheet(); renderDates();
      if(S.dates.toVisit.length){
        setTimeout(()=>{
          openModal(`
            <div class="mbox-icon"><i data-lucide="shuffle"></i></div>
            <div class="mbox-title">Ready to spin again?</div>
            <div class="mbox-sub">There are ${S.dates.toVisit.length} places left on your list.</div>
            <div class="mbox-btns">
              <button class="mbox-btn" id="gamble-no"><i data-lucide="x"></i>Not now</button>
              <button class="mbox-btn primary-btn" id="gamble-yes"><i data-lucide="shuffle"></i>Gamble Again</button>
            </div>`,
          ()=>{
            document.getElementById('gamble-no').onclick = closeModal;
            document.getElementById('gamble-yes').onclick = ()=>{ closeModal(); openWheelOverlay(S.dates.toVisit); };
          });
        }, 300);
      }
    };
  });
}

function exportVisited(){
  if(typeof XLSX==='undefined'){ alert('SheetJS not loaded'); return; }
  const rows = S.dates.visited.map(p=>({
    Name:p.name, Address:p.address||'', Rating:p.rating,
    Notes:p.notes||'', Visited:p.visitedAt?new Date(p.visitedAt).toLocaleDateString():''
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Visited');
  XLSX.writeFile(wb,'date-nights.xlsx');
}

/* ════════════════════════════════════════ SETTINGS TAB */
function renderSettings(){
  document.getElementById('hdr').innerHTML = `
    <div class="flat-hdr">
      <div><div class="flat-hdr-title">Settings</div><div class="flat-hdr-sub">${escapeHtml(S.name1)} &amp; ${escapeHtml(S.name2)}</div></div>
      <div class="flat-hdr-icon"><i data-lucide="settings"></i></div>
    </div>`;
  setPanelHTML(`
    <div style="padding-top:14px"></div>
    <div class="settings-card">
      <div class="srow" id="s-edit-names">
        <div class="srow-icon"><i data-lucide="users"></i></div>
        <div class="srow-info"><div class="srow-label">Edit names</div><div class="srow-sub">${escapeHtml(S.name1)} &amp; ${escapeHtml(S.name2)}</div></div>
        <div class="srow-chev"><i data-lucide="chevron-right"></i></div>
      </div>
      <div class="srow" id="s-edit-role">
        <div class="srow-icon"><i data-lucide="smartphone"></i></div>
        <div class="srow-info"><div class="srow-label">This device is</div><div class="srow-sub">${escapeHtml(myName())}</div></div>
        <div class="srow-chev"><i data-lucide="chevron-right"></i></div>
      </div>
      <div class="srow" id="s-appearance">
        <div class="srow-icon"><i data-lucide="moon"></i></div>
        <div class="srow-info"><div class="srow-label">Appearance</div><div class="srow-sub">${loadThemePref()==='dark' ? 'Dark' : 'Light'}</div></div>
        <div class="srow-chev"><i data-lucide="chevron-right"></i></div>
      </div>
      <div class="srow">
        <div class="srow-icon"><i data-lucide="square-check"></i></div>
        <div class="srow-info"><div class="srow-label">Done / Skip buttons</div><div class="srow-sub" id="s-btns-sub">${lsGet('ht-task-buttons')==='1' ? 'Shown on task cards' : 'Hidden — swipe cards instead'}</div></div>
        <label class="toggle-switch">
          <input type="checkbox" id="s-task-buttons" ${lsGet('ht-task-buttons')==='1'?'checked':''}>
          <div class="toggle-slider"></div>
        </label>
      </div>
      <div class="srow">
        <div class="srow-icon"><i data-lucide="panel-top-close"></i></div>
        <div class="srow-info"><div class="srow-label">Compact Tasks header</div><div class="srow-sub" id="s-hdr-sub">${alwaysCompactHdr() ? 'Mini bar always on' : 'Big header, shrinks on scroll'}</div></div>
        <label class="toggle-switch">
          <input type="checkbox" id="s-compact-hdr" ${alwaysCompactHdr()?'checked':''}>
          <div class="toggle-slider"></div>
        </label>
      </div>
    </div>
    <div class="settings-card">
      <div class="srow danger" id="s-delete-all">
        <div class="srow-icon red-icon"><i data-lucide="trash-2"></i></div>
        <div class="srow-info"><div class="srow-label">Delete all data</div><div class="srow-sub">Wipes everything permanently</div></div>
        <div class="srow-chev"><i data-lucide="chevron-right"></i></div>
      </div>
    </div>
    <div style="padding:16px 20px;color:var(--muted);font-size:13px;font-weight:600;text-align:center">Made for ${escapeHtml(S.name1)} &amp; ${escapeHtml(S.name2)} ♥</div>`);
  lucide.createIcons();

  document.getElementById('s-edit-names').onclick = ()=>{
    openSheet(`
      <div class="grabber"></div>
      <div class="sheet-head"><div class="sheet-title">Edit names</div>
        <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button></div>
      <div class="sheet-field"><i data-lucide="user" class="ic"></i>
        <input id="s-n1" type="text" value="${escapeHtml(S.name1)}" placeholder="Your name"></div>
      <div class="sheet-field"><i data-lucide="users" class="ic"></i>
        <input id="s-n2" type="text" value="${escapeHtml(S.name2)}" placeholder="Partner's name"></div>
      <button class="btn-primary" id="save-names"><i data-lucide="check"></i>Save</button>`,
    ()=>{
      document.getElementById('sh-close').onclick = closeSheet;
      document.getElementById('save-names').onclick = ()=>{
        const n1=document.getElementById('s-n1').value.trim();
        const n2=document.getElementById('s-n2').value.trim();
        commitChange(state => {
          // Renaming a partner would otherwise orphan every task/history
          // entry already assigned to their old name — migrate those values
          // in the same change instead of leaving them stuck on the old name.
          const oldName1 = state.name1, oldName2 = state.name2;
          const changed1 = n1 && n1 !== oldName1;
          const changed2 = n2 && n2 !== oldName2;
          if(changed1 || changed2){
            const remap = a => a===oldName1&&changed1 ? n1 : a===oldName2&&changed2 ? n2 : a;
            state.tasks.forEach(t => { t.assignee = remap(t.assignee); });
            state.completedLog.forEach(l => { l.assignee = remap(l.assignee); });
          }
          if(changed1) state.name1 = n1;
          if(changed2) state.name2 = n2;
        });
        closeSheet(); renderSettings();
      };
    });
  };
  document.getElementById('s-edit-role').onclick = ()=>{
    openSheet(`
      <div class="grabber"></div>
      <div class="sheet-head"><div class="sheet-title">This device is</div>
        <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button></div>
      <div class="chips">
        <div class="chip ${myRole!=='name2'?'sel':''}" data-role="name1"><i data-lucide="user"></i>&nbsp;${escapeHtml(S.name1)}</div>
        <div class="chip ${myRole==='name2'?'sel':''}" data-role="name2"><i data-lucide="user"></i>&nbsp;${escapeHtml(S.name2)}</div>
      </div>`,
    ()=>{
      document.getElementById('sh-close').onclick = closeSheet;
      document.querySelectorAll('[data-role]').forEach(el => el.addEventListener('click', ()=>{
        myRole = el.dataset.role; saveRole(myRole);
        closeSheet(); renderSettings();
      }));
    });
  };
  document.getElementById('s-appearance').onclick = ()=>{
    const cur = loadThemePref();
    openSheet(`
      <div class="grabber"></div>
      <div class="sheet-head"><div class="sheet-title">Appearance</div>
        <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button></div>
      <div class="toggle-sub" style="margin:-6px 2px 0">Light is the default. Dark is manual-only — it never switches on by itself.</div>
      <div class="chips">
        <div class="chip ${cur==='light'?'sel':''}" data-theme-pick="light"><i data-lucide="sun"></i>&nbsp;Light</div>
        <div class="chip ${cur==='dark'?'sel':''}" data-theme-pick="dark"><i data-lucide="moon"></i>&nbsp;Dark</div>
      </div>`,
    ()=>{
      document.getElementById('sh-close').onclick = closeSheet;
      document.querySelectorAll('[data-theme-pick]').forEach(el => el.addEventListener('click', ()=>{
        saveThemePref(el.dataset.themePick);
        applyTheme();
        closeSheet(); renderSettings();
      }));
    });
  };
  document.getElementById('s-task-buttons').addEventListener('change', e => {
    lsSet('ht-task-buttons', e.target.checked ? '1' : '0');
    const sub = document.getElementById('s-btns-sub');
    if(sub) sub.textContent = e.target.checked ? 'Shown on task cards' : 'Hidden — swipe cards instead';
  });
  document.getElementById('s-compact-hdr').addEventListener('change', e => {
    lsSet('ht-hdr-compact', e.target.checked ? '1' : '0');
    const sub = document.getElementById('s-hdr-sub');
    if(sub) sub.textContent = e.target.checked ? 'Mini bar always on' : 'Big header, shrinks on scroll';
  });
  document.getElementById('s-delete-all').onclick = ()=>{
    if(!confirm('Delete ALL data? This cannot be undone.')) return;
    HOUSEHOLD.delete(); location.reload();
  };
}

/* ════════════════════════════════════════ ROOMS TAB */
function renderRooms(){
  currentRoomDetail = null;
  document.getElementById('hdr').innerHTML = `
    <div class="flat-hdr">
      <div><div class="flat-hdr-title">Rooms</div><div class="flat-hdr-sub">Tasks by area</div></div>
      <div class="flat-hdr-icon"><i data-lucide="layout-grid"></i></div>
    </div>`;
  let html = '<div class="room-grid">';
  ROOM_CHIPS.forEach(room => {
    const count = S.tasks.filter(t=>t.room===room.name).length;
    html += `<div class="room-tile" data-room-nav="${room.name}">
      <div class="room-badge ${count===0?'zero':''}">${count}</div>
      <div class="room-tile-icon"><i data-lucide="${room.icon}"></i></div>
      <div class="room-tile-name">${room.name}</div>
    </div>`;
  });
  html += '</div>';
  setPanelHTML(html);
  lucide.createIcons();
  document.querySelectorAll('[data-room-nav]').forEach(tile=>{
    tile.addEventListener('click',()=>renderRoomDetail(tile.dataset.roomNav));
  });
}
function renderRoomDetail(roomName){
  currentRoomDetail = roomName;
  const room = ROOM_CHIPS.find(r=>r.name===roomName);
  const tasks = S.tasks.filter(t=>t.room===roomName).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const t = todayStr();
  let html = `<button class="room-back" id="room-back-btn"><i data-lucide="arrow-left"></i>Rooms</button>`;
  if(!tasks.length){
    html += `<div class="empty-state"><i data-lucide="${room?room.icon:'layout-grid'}"></i><p>No tasks in ${roomName}</p></div>`;
  } else {
    const overdue   = tasks.filter(x=>x.dueDate<t);
    const upcoming  = tasks.filter(x=>x.dueDate>=t);
    if(overdue.length){
      html += `<div class="day-header"><div class="day-label" style="color:var(--red)">Overdue</div></div>`;
      overdue.forEach(x=>{html+=taskCardHTML(x);});
    }
    upcoming.forEach(x=>{html+=taskCardHTML(x);});
  }
  setPanelHTML(html);
  lucide.createIcons();
  document.getElementById('room-back-btn').onclick=()=>renderRooms();
  document.querySelectorAll('[data-done]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation(); completeTask(btn.dataset.done);
  }));
  document.querySelectorAll('[data-skip]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation(); skipTask(btn.dataset.skip);
  }));
  document.querySelectorAll('[data-task-card]').forEach(card=>card.addEventListener('click',e=>{
    if(e.target.closest('button,a')) return;
    openTaskDetail(card.dataset.taskCard);
  }));
}

/* ════════════════════════════════════════ SHEET / MODAL HELPERS */
function openSheet(html, cb){
  document.getElementById('sheet').innerHTML = html;
  document.getElementById('overlay').classList.remove('hidden');
  lucide.createIcons();
  if(cb) cb();
  document.getElementById('dim').onclick = closeSheet;
}
function closeSheet(){
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('sheet').innerHTML='';
}
function openModal(html, cb){
  document.getElementById('mbox').innerHTML = html;
  document.getElementById('modal-layer').classList.remove('hidden');
  lucide.createIcons();
  if(cb) cb();
  document.getElementById('mdim').onclick = closeModal;
}
function closeModal(){
  document.getElementById('modal-layer').classList.add('hidden');
}

/* ════════════════════════════════════════ MEAL PREP TAB */
const MEAL_STYLES = [
  {id:'mix',     name:'Mix-and-match',        desc:'Components you assemble differently each night', icon:'salad'},
  {id:'batch',   name:'Batch cooking',        desc:'One meal, multiple nights',                      icon:'soup'},
  {id:'freezer', name:'Freezer prep',         desc:'Longer horizon — weeks, not days',               icon:'snowflake'},
  {id:'twice',   name:'Cook once, eat twice', desc:'One dish deliberately morphed across the week',  icon:'repeat-2'},
];
// Deployed meal-prep-proxy Worker (Workers AI). After `npx wrangler deploy`
// prints the URL, paste it here.
const MEAL_PROXY_URL = 'https://meal-prep-proxy.zacfisherman.workers.dev';

// Seed protein set — shown when no saved recipes exist yet. Once recipes
// carry their own protein tags, the picker becomes the union of these seeds
// and every distinct tag across the cookbook (deduplicated by normalized key).
const PROTEIN_SEEDS = ['Chicken thigh','Chicken breast','Beef mince','Pork shoulder','Salmon','White fish','Prawns','Tofu','Eggs'];
const PROTEIN_CAP = 3;
let mealStylePicking = false; // true while the style-cards view is open over an existing choice
let mealResults = null;       // {loading, error, suggested:[]} — transient, per-device

// Canonical protein key: lowercase, collapsed whitespace, last word
// singularized — "Lentils"/"lentil" and "chicken thighs"/"Chicken thigh"
// collapse to one option. Mirrors the Worker's normalizer exactly.
function normalizeProtein(s){
  let t = (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if(t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}
// Adaptive picker options: seeds first (fixed order), then any distinct
// recipe-derived tags alphabetically, then any currently-selected tag whose
// recipe has since been deleted (so it stays visible and deselectable).
function proteinOptions(){
  const seen = new Map();
  PROTEIN_SEEDS.forEach(p => seen.set(normalizeProtein(p), p));
  const extras = [];
  mealRecipes.forEach(r => {
    const key = normalizeProtein(r.protein || '');
    if(key && !seen.has(key)){ seen.set(key, r.protein.trim()); extras.push(r.protein.trim()); }
  });
  extras.sort((a,b) => a.localeCompare(b));
  const orphans = [];
  (S.mealPrep?.proteins || []).forEach(p => {
    const key = normalizeProtein(p);
    if(key && !seen.has(key)){ seen.set(key, p); orphans.push(p); }
  });
  return [...PROTEIN_SEEDS, ...extras, ...orphans];
}

/* ── saved recipes: households/home/recipes subcollection ── */
const RECIPES = HOUSEHOLD.collection('recipes');
let mealRecipes = [];
let recipesSyncStarted = false;
function startRecipesSync(){
  if(recipesSyncStarted) return;
  recipesSyncStarted = true;
  RECIPES.onSnapshot(qs => {
    mealRecipes = qs.docs.map(d => ({id: d.id, ...d.data()}));
    mealRecipes.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    if(currentTab === 'meals') renderMeals();
  }, err => console.error('Recipes sync error:', err));
}
function savedMatches(mp){
  const keys = mp.proteins.map(normalizeProtein);
  return mealRecipes.filter(r =>
    (!keys.length || keys.includes(normalizeProtein(r.protein || ''))) &&
    (!Array.isArray(r.styles) || !r.styles.length || r.styles.includes(mp.style))
  );
}
// Loose search across title/protein/style names: every query token must
// appear somewhere in the haystack (case-insensitive).
function recipeMatchesQuery(r, q){
  const tokens = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if(!tokens.length) return true;
  const styleNames = (r.styles || []).map(id => (MEAL_STYLES.find(s => s.id === id) || {}).name || '').join(' ');
  const hay = `${r.name || ''} ${r.protein || ''} ${styleNames}`.toLowerCase();
  return tokens.every(t => hay.includes(t));
}

function renderMeals(){
  const mp = S.mealPrep || {style:null, proteins:[], activeRecipeIds:[], grocery:[]};
  const inGrocery = mealSubView === 'grocery';
  document.getElementById('hdr').innerHTML = `
    <div class="flat-hdr">
      <div><div class="flat-hdr-title">Meal Prep</div>
        <div class="flat-hdr-sub">${inGrocery ? (mp.grocery.length ? `${mp.grocery.filter(g=>g.checked).length} of ${mp.grocery.length} gotten` : 'This week\'s groceries') : "This week's cooking plan"}</div></div>
      <div class="flat-hdr-icon"><i data-lucide="chef-hat"></i></div>
    </div>`;

  let html = `<div class="tasks-view-row">
    <div class="tasks-view-chips">
      <button class="tv-chip${!inGrocery?' sel':''}" id="mv-recipes"><i data-lucide="book-open"></i>Recipes</button>
      <button class="tv-chip${inGrocery?' sel':''}" id="mv-grocery"><i data-lucide="shopping-basket"></i>Grocery</button>
    </div>
    <button class="paste-pill" id="mv-paste"><i data-lucide="book-plus"></i>Add a recipe</button>
  </div>`;

  if(inGrocery){
    html += _groceryViewHTML(mp);
  } else {
    html += _recipesViewHTML(mp);
  }
  setPanelHTML(html);
  lucide.createIcons();

  document.getElementById('mv-recipes').onclick = ()=>{ mealSubView='recipes'; renderMeals(); };
  document.getElementById('mv-grocery').onclick = ()=>{ mealSubView='grocery'; renderMeals(); };
  document.getElementById('mv-paste').onclick = openAddRecipeSheet;
  _bindMealHandlers(mp);
  if(inGrocery) _bindGroceryHandlers(mp);
}

function _recipesViewHTML(mp){
  if(!mp.style || mealStylePicking){
    return `<div class="seg-lbl" style="margin:18px 0 10px 22px">How are we prepping this week?</div>` +
      MEAL_STYLES.map(s => `
        <button class="style-card${mp.style===s.id?' sel':''}" data-style="${s.id}">
          <div class="style-ic"><i data-lucide="${s.icon}"></i></div>
          <div>
            <div class="style-name">${s.name}</div>
            <div class="style-desc">${s.desc}</div>
          </div>
        </button>`).join('');
  }
  const style = MEAL_STYLES.find(s => s.id === mp.style) || MEAL_STYLES[0];
  const count = mp.proteins.length;
  return `
    <button class="style-current" id="mp-change-style">
      <div class="style-ic"><i data-lucide="${style.icon}"></i></div>
      <div class="n">${style.name}</div>
      <div class="chg">Change<i data-lucide="chevron-right" style="width:13px;height:13px"></i></div>
    </button>
    <div class="seg-lbl" style="margin:20px 22px 10px;display:flex;justify-content:space-between">
      <span>Proteins</span>
      <span style="color:var(--sky-deep);letter-spacing:.02em;text-transform:none">${count} of ${PROTEIN_CAP}${count>=PROTEIN_CAP?' — cap reached':''}</span>
    </div>
    <div class="pk-row">
      ${proteinOptions().map(p => {
        const on = mp.proteins.includes(p);
        const dis = !on && count >= PROTEIN_CAP;
        return `<button class="pk-chip${on?' on':''}${dis?' dis':''}" data-protein="${escapeHtml(p)}">${escapeHtml(p)}</button>`;
      }).join('')}
    </div>
    <button class="btn-primary mp-cta" id="mp-find">Find recipes <i data-lucide="search"></i></button>
    ${_savedListHTML(mp)}
    ${_aiSectionHTML(mp)}`;
}

/* ── results: saved first, then AI suggestions ── */
function _recipeCardHTML(r, kind, inWeek, ref){
  const meta = [r.serves ? `Serves ${r.serves}` : '', r.minutes ? `${r.minutes} min` : '', kind==='sugg' ? 'AI suggestion' : '']
    .filter(Boolean).join(' · ');
  return `<div class="rc-card${inWeek?' active':''}">
    <span class="rc-tag ${kind}">${kind==='saved' ? 'Saved' : 'Suggested'}</span>
    <div class="rc-name">${escapeHtml(r.name)}</div>
    ${meta ? `<div class="rc-meta">${escapeHtml(meta)}</div>` : ''}
    ${r.summary ? `<div class="rc-sum">${escapeHtml(r.summary)}</div>` : ''}
    <div class="rc-chips"><span class="rc-chip p">${escapeHtml(r.protein || '?')}</span></div>
    <div class="rc-btns">
      <button class="rc-btn" data-view-${kind}="${ref}">View</button>
      <button class="rc-btn ${inWeek ? 'added' : 'add'}" data-week-${kind}="${ref}">${inWeek ? '✓ In this week' : '+ Add to week'}</button>
    </div>
  </div>`;
}
// Saved matches render permanently under the picker and re-filter live on
// every protein-chip tap (slicer behavior) — no button press involved.
function _savedListHTML(mp){
  const saved = savedMatches(mp);
  const weekCount = (mp.activeRecipeIds || []).length;
  let html = `<div id="mp-results">
    <div class="weekbar" style="margin-top:6px">
      <span><b>${weekCount} recipe${weekCount===1?'':'s'}</b> in this week's set</span>
      ${weekCount ? '<button class="wb-clear" id="mp-clear">Clear</button>' : ''}
    </div>
    <div class="seg-lbl" style="margin:18px 22px 8px;display:flex;justify-content:space-between">
      <span>From your saved recipes</span>
      <span style="text-transform:none;letter-spacing:0;color:var(--sky-deep)">${saved.length} match${saved.length===1?'':'es'}</span>
    </div>`;
  if(saved.length){
    saved.forEach(r => { html += _recipeCardHTML(r, 'saved', (mp.activeRecipeIds||[]).includes(r.id), r.id); });
  } else if(!mealResults?.aiRequested){
    html += `<div class="rc-none" style="border-style:solid">
      No saved recipe matches this combo. What would you like to do?
      <div style="display:flex;gap:8px;margin-top:12px;width:100%">
        <button class="rc-btn" id="mp-paste-instead" style="flex:1">Find one &amp; paste it</button>
        ${mp.proteins.length ? '<button class="rc-btn add" id="mp-ai-go" style="flex:1"><i data-lucide="sparkles"></i>&nbsp;AI suggestion</button>' : ''}
      </div>
    </div>`;
  }
  if(saved.length && !mealResults?.aiRequested && mp.proteins.length){
    html += `<button class="rc-btn add" id="mp-more-ai" style="margin:12px 16px 0;width:calc(100% - 32px)"><i data-lucide="sparkles"></i>&nbsp;Get AI suggestions too</button>`;
  }
  return html + `</div>`;
}
// AI suggestions stay a separate, explicit opt-in — untouched by the slicer.
function _aiSectionHTML(mp){
  if(!mealResults?.aiRequested) return '';
  let html = `<div class="seg-lbl" style="margin:20px 22px 8px">Suggested for this combo</div>`;
  if(mealResults.loading){
    html += `<div class="rc-none loading-row"><span class="ld-dot"></span><span class="ld-dot"></span><span class="ld-dot"></span>&nbsp;Asking the kitchen…</div>`;
  } else if(mealResults.error){
    html += `<div class="rc-none err">
      ${escapeHtml(mealResults.error)}
      <button class="rc-btn add" id="mp-retry" style="margin-top:10px;max-width:180px">Try again</button>
    </div>`;
  } else if(!mealResults.suggested.length){
    html += `<div class="rc-none">Nothing usable came back — try again or tweak the proteins.</div>`;
  } else {
    mealResults.suggested.forEach((r, i) => { html += _recipeCardHTML(r, 'sugg', false, String(i)); });
  }
  return html;
}
async function fetchSuggestions(mp){
  if(MEAL_PROXY_URL.includes('YOUR-SUBDOMAIN')){
    mealResults = {aiRequested:true, loading:false, suggested:[], error:'The meal-prep-proxy Worker is not deployed yet — run wrangler deploy and set MEAL_PROXY_URL in app.js.'};
    if(currentTab==='meals' && mealSubView==='recipes') renderMeals();
    return;
  }
  const styleName = (MEAL_STYLES.find(s => s.id === mp.style) || {}).name || 'meal prep';
  try{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // live 70b suggest runs measured up to ~24s
    const res = await fetch(MEAL_PROXY_URL + '/suggest', {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body: JSON.stringify({styleName, proteins: mp.proteins, existingRecipeNames: mealRecipes.map(r => r.name)})
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    mealResults = {aiRequested:true, loading:false, error:null, suggested:(data.recipes||[])};
  }catch(e){
    mealResults = {aiRequested:true, loading:false, suggested:[], error: e.name==='AbortError' ? 'Suggestion request timed out — try again' : e.message};
  }
  if(currentTab==='meals' && mealSubView==='recipes') renderMeals();
}

/* ── recipe detail viewer ── */
// Kitchen-style quantity display: snap near-misses onto common cooking
// fractions (the AI parse returns float32 artifacts like 0.33333334326744
// for a third) and never show more than 2 decimals otherwise. Everything
// printed here must survive parseQtyToken on the way back in.
const QTY_FRACTIONS = [[1/8,'⅛'],[1/4,'¼'],[1/3,'⅓'],[3/8,'⅜'],[1/2,'½'],[5/8,'⅝'],[2/3,'⅔'],[3/4,'¾'],[7/8,'⅞']];
function fmtQty(q){
  if(q == null) return '';
  if(typeof q !== 'number' || !isFinite(q)) return String(q);
  const whole = Math.floor(q + 1e-6);
  const frac = q - whole;
  if(frac < 0.01 || frac > 0.99) return String(Math.round(q));
  const hit = QTY_FRACTIONS.find(([v]) => Math.abs(frac - v) <= 0.012);
  if(hit) return (whole || '') + hit[1];
  return String(parseFloat(q.toFixed(2)));
}
function fmtIngredient(i){ return [fmtQty(i.qty), i.unit||'', i.item].filter(Boolean).join(' '); }
function openRecipeView(r){
  const meta = [r.serves ? `Serves ${r.serves}` : '', r.minutes ? `${r.minutes} min` : ''].filter(Boolean).join(' · ');
  // AI suggestions pass through here too before adoption — they have no
  // cookbook doc yet, so edit/delete only appear for saved recipes.
  const saved = mealRecipes.find(x => x.id === r.id);
  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">${escapeHtml(r.name)}</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <div class="rc-chips" style="margin-top:-6px"><span class="rc-chip p">${escapeHtml(r.protein||'?')}</span>${meta?`<span class="rc-chip">${escapeHtml(meta)}</span>`:''}</div>
    <div class="seg-lbl">Ingredients</div>
    <div class="rv-list">${(r.ingredients||[]).map(i => `<div class="rv-ing">${escapeHtml(fmtIngredient(i))}</div>`).join('') || '<div class="rv-ing" style="color:var(--muted)">None listed</div>'}</div>
    <div class="seg-lbl">Steps</div>
    <div class="rv-list">${(r.steps||[]).map((s,i) => `<div class="rv-step"><b>${i+1}.</b> ${escapeHtml(s)}</div>`).join('') || '<div class="rv-ing" style="color:var(--muted)">None listed</div>'}</div>
    ${saved ? `<div class="rc-btns" style="margin-top:16px">
      <button class="rc-btn del" id="rv-del" style="flex:1"><i data-lucide="trash-2"></i>&nbsp;Delete</button>
      <button class="rc-btn add" id="rv-edit" style="flex:1"><i data-lucide="pencil"></i>&nbsp;Edit</button>
    </div>` : ''}`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    if(saved){
      document.getElementById('rv-edit').onclick = ()=> openParseReviewSheet(saved, 'edit');
      document.getElementById('rv-del').onclick = ()=> deleteRecipe(saved);
    }
  });
}
function deleteRecipe(r){
  if(!confirm(`Delete “${r.name}” forever? It comes off this week's set and grocery list too. This cannot be undone.`)) return;
  RECIPES.doc(r.id).delete().then(()=>{
    // Optimistic cache update so the reopened list is already correct;
    // the snapshot listener confirms shortly after.
    mealRecipes = mealRecipes.filter(x => x.id !== r.id);
    commitChange(state => {
      const arr = state.mealPrep.activeRecipeIds || [];
      const i = arr.indexOf(r.id);
      if(i >= 0) arr.splice(i, 1);
      regenerateGrocery(state);
    });
    openRecipeSearchSheet(false);
    if(currentTab === 'meals') renderMeals();
  }).catch(err => alert('Delete failed: ' + (err.message || err)));
}
/* ── grocery engine ─────────────────────────────────────────────
   Recipe-derived lines are regenerated whenever the week's set
   changes; manual items and already-checked lines survive. Only
   lossless unit merges happen (kg→g, l→ml); same ingredient in
   irreconcilable units stays as separate, flagged lines. */
function normKey(s){
  let t = (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if(t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}
const UNIT_ALIAS = {grams:'g',gram:'g',gr:'g',kgs:'kg',kilogram:'kg',kilograms:'kg',
  mls:'ml',milliliter:'ml',milliliters:'ml',millilitre:'ml',millilitres:'ml',
  litre:'l',litres:'l',liter:'l',liters:'l',
  tablespoon:'tbsp',tablespoons:'tbsp',teaspoon:'tsp',teaspoons:'tsp'};
function normUnit(u){
  if(!u) return null;
  let t = String(u).toLowerCase().trim();
  if(!t) return null;
  t = UNIT_ALIAS[t] || t;
  if(t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}
function prettyQty(qty, unit){
  if(qty == null) return '';
  if(unit === 'g'  && qty >= 1000) return fmtQty(Math.round(qty/100)/10) + ' kg';
  if(unit === 'ml' && qty >= 1000) return fmtQty(Math.round(qty/100)/10) + ' l';
  return fmtQty(qty) + (unit ? ' ' + unit : '');
}
// A recipe logs as "eaten" the moment ALL of its derived grocery lines are
// checked while it is still in the week's set. loggedIds guards against
// duplicate logging within a cycle; it is pruned when a recipe leaves the
// set (so a later week can log it again) while mealLog entries persist.
function recordMealCompletions(state){
  const mp = state.mealPrep;
  mp.mealLog = mp.mealLog || [];
  mp.loggedIds = mp.loggedIds || [];
  (mp.activeRecipeIds || []).forEach(rid => {
    if(mp.loggedIds.includes(rid)) return;
    const lines = (mp.grocery || []).filter(g => !g.manual && (g.sources || []).includes(rid));
    if(!lines.length || !lines.every(l => l.checked)) return;
    const r = mealRecipes.find(x => x.id === rid);
    if(!r) return;
    mp.mealLog.push({recipeId: rid, name: r.name, protein: r.protein || '', at: Date.now()});
    mp.loggedIds.push(rid);
  });
}
// Wheel-pick lifecycle: 'pending' until either marked visited or superseded
// by a later REAL spin. Entries from before statuses existed resolve lazily.
function wheelPickStatus(w, visitedNameSet){
  if(w.status) return w.status;
  return visitedNameSet.has(normKey(w.name || '')) ? 'visited' : 'pending';
}
function grocerySort(a, b){
  return (a.checked - b.checked) || (a.manual - b.manual) || a.name.localeCompare(b.name);
}
// Rebuilds state.mealPrep.grocery from the active recipe set. extraById lets
// a just-adopted suggestion contribute before the subcollection listener has
// echoed it back into the local cache.
function regenerateGrocery(state, extraById){
  const mp = state.mealPrep;
  const byId = {};
  mealRecipes.forEach(r => { byId[r.id] = r; });
  Object.assign(byId, extraById || {});

  const desired = new Map();   // groupKey → {name, qty, unit, sources[]}
  const keyUnits = new Map();  // ingredient key → Set of unit-pools seen
  (mp.activeRecipeIds || []).forEach(id => {
    const r = byId[id]; if(!r) return;
    (r.ingredients || []).forEach(ing => {
      if(!ing || !ing.item) return;
      const key = normKey(ing.item);
      let unit = normUnit(ing.unit);
      let qty = (typeof ing.qty === 'number' && isFinite(ing.qty) && ing.qty > 0) ? ing.qty : null;
      if(qty != null && unit === 'kg'){ qty *= 1000; unit = 'g'; }
      if(qty != null && unit === 'l'){ qty *= 1000; unit = 'ml'; }
      // qty-less mentions pool separately ('~'); counted-but-unitless pool as '#'
      const pool = qty == null ? '~' : (unit || '#');
      const gk = key + '|' + pool;
      if(!keyUnits.has(key)) keyUnits.set(key, new Set());
      keyUnits.get(key).add(pool);
      if(!desired.has(gk)) desired.set(gk, {name: ing.item.trim(), qty: qty == null ? null : 0, unit: qty == null ? null : unit, sources: []});
      const d = desired.get(gk);
      if(d.qty != null && qty != null) d.qty += qty;
      if(!d.sources.includes(id)) d.sources.push(id);
    });
  });

  // tombstones: a manually-deleted derived line stays gone while its group is
  // still wanted; auto-purged once nothing wants it anymore
  mp.dismissed = (mp.dismissed || []).filter(gk => desired.has(gk));
  const conflictKeys = new Set([...keyUnits].filter(([,set]) => set.size > 1).map(([k]) => k));

  const old = mp.grocery || [];
  const oldByGk = {};
  old.forEach(it => { if(!it.manual) oldByGk[it.gk] = it; });
  const next = [];
  desired.forEach((d, gk) => {
    if(mp.dismissed.includes(gk)) return;
    const prev = oldByGk[gk];
    next.push({
      id: prev ? prev.id : uid(), gk, manual: false,
      name: d.name, qty: d.qty, unit: d.unit, sources: d.sources,
      conflict: conflictKeys.has(gk.split('|')[0]),
      checked: prev ? !!prev.checked : false,
    });
  });
  // checked lines whose recipe left the set survive — likely already bought
  old.forEach(it => {
    if(!it.manual && it.checked && !desired.has(it.gk)) next.push({...it, conflict: false});
  });
  old.forEach(it => { if(it.manual) next.push(it); });
  next.sort(grocerySort);
  mp.grocery = next;
  mp.loggedIds = (mp.loggedIds || []).filter(rid => (mp.activeRecipeIds || []).includes(rid));
}

function _grocerySrcLabel(item){
  if(item.manual) return 'added manually';
  const names = (item.sources || []).map(id => mealRecipes.find(r => r.id === id)?.name).filter(Boolean);
  if(!names.length) return 'from a removed recipe';
  if(names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}
function _groceryViewHTML(mp){
  const items = mp.grocery || [];
  if(!items.length){
    const hasActive = (mp.activeRecipeIds || []).length > 0;
    return `<div class="empty-state">
      <i data-lucide="shopping-basket"></i>
      <div class="es-title">Nothing on the list</div>
      <p>${hasActive ? 'Your week’s recipes had no listed ingredients — add items below.' : 'Add recipes to this week and the groceries build themselves.'}</p>
      <button class="rc-btn add" id="g-add-empty" style="margin-top:16px;flex:none;width:180px;padding:0 14px">+ Add item</button>
    </div>`;
  }
  const got = items.filter(i => i.checked).length;
  let html = `<div class="seg-lbl" style="margin:18px 22px 4px;display:flex;justify-content:space-between">
    <span>To get</span>
    <span style="color:var(--sky-deep);letter-spacing:.02em;text-transform:none">${got} of ${items.length} gotten</span>
  </div>`;
  items.forEach(it => {
    html += `<div class="g-item${it.checked ? ' done' : ''}" data-g-toggle="${it.id}">
      <div class="g-check">${it.checked ? '✓' : ''}</div>
      <div class="g-info">
        <div class="g-name">${escapeHtml(it.name)}</div>
        <div class="g-src">${escapeHtml(_grocerySrcLabel(it))}</div>
      </div>
      ${it.conflict && !it.checked ? '<span class="g-flag">units differ</span>' : ''}
      <div class="g-qty">${escapeHtml(prettyQty(it.qty, it.unit))}</div>
      <button class="g-del" data-g-del="${it.id}" aria-label="Remove">✕</button>
    </div>`;
  });
  html += `<button class="g-add" id="g-add"><span class="plus">+</span>Add item</button>`;
  return html;
}
function _bindGroceryHandlers(mp){
  document.querySelectorAll('[data-g-toggle]').forEach(el => el.addEventListener('click', e => {
    if(e.target.closest('[data-g-del]')) return;
    const id = el.dataset.gToggle;
    commitChange(state => {
      const it = (state.mealPrep.grocery || []).find(g => g.id === id);
      if(it){ it.checked = !it.checked; state.mealPrep.grocery.sort(grocerySort); }
      recordMealCompletions(state);
    });
    renderMeals();
  }));
  document.querySelectorAll('[data-g-del]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const id = el.dataset.gDel;
    commitChange(state => {
      const g = state.mealPrep.grocery || [];
      const it = g.find(x => x.id === id);
      state.mealPrep.grocery = g.filter(x => x.id !== id);
      if(it && !it.manual){
        state.mealPrep.dismissed = state.mealPrep.dismissed || [];
        if(!state.mealPrep.dismissed.includes(it.gk)) state.mealPrep.dismissed.push(it.gk);
      }
      recordMealCompletions(state);
    });
    renderMeals();
  }));
  const add = document.getElementById('g-add') || document.getElementById('g-add-empty');
  if(add) add.onclick = openAddGroceryItemSheet;
}
function openAddGroceryItemSheet(){
  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">Add item</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <div class="seg-lbl" style="margin-bottom:6px">Item</div>
    <input class="plain-input" id="gi-name" placeholder="Paper towels, coffee…">
    <div style="display:flex;gap:10px">
      <div style="flex:1"><div class="seg-lbl" style="margin-bottom:6px">Qty <span style="text-transform:none;letter-spacing:0">(optional)</span></div>
        <input class="plain-input" id="gi-qty" type="number" min="0" step="any"></div>
      <div style="flex:1"><div class="seg-lbl" style="margin-bottom:6px">Unit <span style="text-transform:none;letter-spacing:0">(optional)</span></div>
        <input class="plain-input" id="gi-unit" placeholder="g, pack…"></div>
    </div>
    <button class="btn-primary" id="gi-save"><i data-lucide="check"></i>Add to list</button>`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    document.getElementById('gi-name').focus();
    document.getElementById('gi-save').onclick = ()=>{
      const name = document.getElementById('gi-name').value.trim();
      if(!name){ document.getElementById('gi-name').focus(); return; }
      let qty = parseFloat(document.getElementById('gi-qty').value);
      qty = (isFinite(qty) && qty > 0) ? qty : null;
      let unit = normUnit(document.getElementById('gi-unit').value.trim());
      if(qty != null && unit === 'kg'){ qty *= 1000; unit = 'g'; }
      if(qty != null && unit === 'l'){ qty *= 1000; unit = 'ml'; }
      const item = {id: uid(), gk: 'manual|' + uid(), manual: true, name, qty, unit: qty == null ? null : unit, sources: [], conflict: false, checked: false};
      commitChange(state => {
        state.mealPrep.grocery = state.mealPrep.grocery || [];
        state.mealPrep.grocery.push(item);
        state.mealPrep.grocery.sort(grocerySort);
      });
      closeSheet(); renderMeals();
    };
  });
}
function _bindMealHandlers(mp){
  document.querySelectorAll('[data-style]').forEach(el => el.addEventListener('click', ()=>{
    const id = el.dataset.style;
    mealStylePicking = false;
    mealResults = null; // selections changed → stale results
    commitChange(state => { state.mealPrep.style = id; });
    renderMeals();
  }));
  const chg = document.getElementById('mp-change-style');
  if(chg) chg.onclick = ()=>{ mealStylePicking = true; renderMeals(); };
  document.querySelectorAll('[data-protein]').forEach(el => el.addEventListener('click', ()=>{
    const p = el.dataset.protein;
    mealResults = null;
    commitChange(state => {
      const arr = state.mealPrep.proteins;
      const i = arr.indexOf(p);
      if(i >= 0) arr.splice(i, 1);
      else if(arr.length < PROTEIN_CAP) arr.push(p);
    });
    renderMeals();
  }));
  const find = document.getElementById('mp-find');
  if(find) find.onclick = ()=> openRecipeSearchSheet(true);
  const requestAI = ()=>{
    mealResults = {aiRequested:true, loading:true, error:null, suggested:[]};
    renderMeals();
    document.getElementById('mp-results')?.scrollIntoView({behavior:'smooth', block:'start'});
    fetchSuggestions(mp);
  };
  const aiGo = document.getElementById('mp-ai-go');
  if(aiGo) aiGo.onclick = requestAI;
  const moreAI = document.getElementById('mp-more-ai');
  if(moreAI) moreAI.onclick = requestAI;
  const retry = document.getElementById('mp-retry');
  if(retry) retry.onclick = requestAI;
  const pasteInstead = document.getElementById('mp-paste-instead');
  if(pasteInstead) pasteInstead.onclick = openAddRecipeSheet;
  const clear = document.getElementById('mp-clear');
  if(clear) clear.onclick = ()=>{ commitChange(state => { state.mealPrep.activeRecipeIds = []; regenerateGrocery(state); }); renderMeals(); };

  document.querySelectorAll('[data-view-saved]').forEach(el => el.addEventListener('click', ()=>{
    const r = mealRecipes.find(x => x.id === el.dataset.viewSaved);
    if(r) openRecipeView(r);
  }));
  document.querySelectorAll('[data-view-sugg]').forEach(el => el.addEventListener('click', ()=>{
    const r = mealResults?.suggested[Number(el.dataset.viewSugg)];
    if(r) openRecipeView(r);
  }));
  document.querySelectorAll('[data-week-saved]').forEach(el => el.addEventListener('click', ()=>{
    const id = el.dataset.weekSaved;
    commitChange(state => {
      const arr = state.mealPrep.activeRecipeIds;
      const i = arr.indexOf(id);
      if(i >= 0) arr.splice(i, 1); else arr.push(id);
      regenerateGrocery(state);
    });
    renderMeals();
  }));
  document.querySelectorAll('[data-week-sugg]').forEach(el => el.addEventListener('click', ()=>{
    const idx = Number(el.dataset.weekSugg);
    const r = mealResults?.suggested[idx];
    if(!r) return;
    // Adding a suggestion adopts it into the cookbook (subcollection doc,
    // flagged source:'ai') and puts it in this week's set — it then shows
    // under Saved via the recipes listener, so drop it from the transient list.
    const id = uid();
    const doc = {
      name: r.name, protein: r.protein, styles: mp.style ? [mp.style] : [],
      serves: r.serves ?? null, minutes: r.minutes ?? null,
      ingredients: r.ingredients || [], steps: r.steps || [],
      source: 'ai', createdAt: Date.now(),
    };
    // Order matters (root cause of the "lost selections" bug): commit the
    // week id ONLY after the cookbook write succeeds, and surface failures
    // instead of a console-only catch — a rules rejection used to orphan
    // the id silently and the card would vanish.
    el.disabled = true;
    RECIPES.doc(id).set(doc).then(() => {
      mealResults.suggested.splice(idx, 1);
      commitChange(state => {
        state.mealPrep.activeRecipeIds.push(id);
        // the listener hasn't echoed the new doc into the cache yet — pass it in
        regenerateGrocery(state, {[id]: doc});
      });
      renderMeals();
    }).catch(err => {
      el.disabled = false;
      openModal(`
        <div class="mbox-icon" style="background:var(--red-soft)"><i data-lucide="alert-triangle" style="color:var(--red)"></i></div>
        <div class="mbox-title">Couldn\'t save that recipe</div>
        <div class="mbox-sub">${escapeHtml(err.message || String(err))}</div>
        <div class="mbox-btns"><button class="mbox-btn primary-btn" id="mp-ok">OK</button></div>`,
      ()=>{ document.getElementById('mp-ok').onclick = closeModal; });
    });
  }));
}

/* ── paste → AI parse → review-before-save ── */
const QTY_GLYPHS = {'¼':1/4,'½':1/2,'¾':3/4,'⅓':1/3,'⅔':2/3,'⅛':1/8,'⅜':3/8,'⅝':5/8,'⅞':7/8};
function parseQtyToken(t){
  if(!t) return null;
  // vulgar-fraction glyphs, alone or as a mixed number ("1½") — fmtQty
  // prints these, so they must round-trip through recipe edits
  let m = t.match(/^(\d+)?([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if(m) return Number(m[1] || 0) + QTY_GLYPHS[m[2]];
  m = t.match(/^(?:(\d+)[-+ ]?)?(\d+)\/(\d+)$/); // 1/2, 1-1/2
  if(m && Number(m[3])) return Number(m[1] || 0) + Number(m[2]) / Number(m[3]);
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function proxyPost(path, body, timeoutMs){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetch(MEAL_PROXY_URL + path, {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  } finally { clearTimeout(timeoutId); }
}
async function runParseFlow(text, btn, errEl, restoreHTML){
  if(MEAL_PROXY_URL.includes('YOUR-SUBDOMAIN')){
    errEl.textContent = 'The meal-prep-proxy Worker is not deployed yet — run wrangler deploy and set MEAL_PROXY_URL in app.js.';
    errEl.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = 'Parsing…';
  try{
    const data = await proxyPost('/parse', {text, existingProteins: proteinOptions()}, 25000);
    openParseReviewSheet(data.recipe, data.via);
  }catch(e){
    errEl.textContent = e.name==='AbortError' ? 'Parse timed out — try again' : e.message;
    errEl.style.display = 'block';
    btn.disabled = false; btn.innerHTML = restoreHTML;
    lucide.createIcons();
  }
}
function openAddRecipeSheet(){
  // Three peer entry methods as tabs; panes stay in the DOM so switching
  // tabs never loses half-typed input. "Enter manually" embeds the same
  // shared form the parse-review and edit screens use.
  const manualForm = recipeFormParts({}, 'manual');
  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">Add a recipe</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <div class="chips">
      <div class="chip sel" data-ar-tab="link">From a link</div>
      <div class="chip" data-ar-tab="paste">Paste text</div>
      <div class="chip" data-ar-tab="manual">Enter manually</div>
    </div>
    <div class="ar-pane" id="ar-pane-link">
      <div class="seg-lbl">Link to the recipe</div>
      <div style="display:flex;gap:8px">
        <input class="plain-input" id="pp-url" type="url" placeholder="https://…" style="flex:1" autocomplete="off">
        <button class="btn-primary" id="pp-fetch" style="width:auto;flex:0 0 auto;padding:0 18px;height:48px;margin:0">Fetch</button>
      </div>
      <div class="rc-none err" id="pp-url-err" style="display:none;margin:0"></div>
    </div>
    <div class="ar-pane hidden" id="ar-pane-paste">
      <div class="seg-lbl">Paste the whole recipe</div>
      <textarea class="modal-notes" id="pp-text" style="min-height:150px" placeholder="Paste the whole thing here…"></textarea>
      <div class="rc-none err" id="pp-err" style="display:none;margin:0"></div>
      <button class="btn-primary" id="pp-parse"><i data-lucide="wand-2"></i>Parse it</button>
    </div>
    <div class="ar-pane hidden" id="ar-pane-manual">${manualForm.html}</div>`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    document.querySelectorAll('[data-ar-tab]').forEach(el => el.addEventListener('click', ()=>{
      document.querySelectorAll('[data-ar-tab]').forEach(e => e.classList.toggle('sel', e===el));
      ['link','paste','manual'].forEach(t =>
        document.getElementById('ar-pane-'+t).classList.toggle('hidden', t!==el.dataset.arTab));
    }));
    manualForm.bind();
    const errEl = document.getElementById('pp-err');
    const urlErrEl = document.getElementById('pp-url-err');
    document.getElementById('pp-parse').onclick = ()=>{
      errEl.style.display = 'none';
      const text = document.getElementById('pp-text').value.trim();
      if(text.length < 20){ errEl.textContent = 'Paste at least a few lines first.'; errEl.style.display = 'block'; return; }
      runParseFlow(text, document.getElementById('pp-parse'), errEl, '<i data-lucide="wand-2"></i>Parse it');
    };
    document.getElementById('pp-fetch').onclick = async ()=>{
      urlErrEl.style.display = 'none';
      const url = document.getElementById('pp-url').value.trim();
      if(!/^https?:\/\//i.test(url)){ urlErrEl.textContent = 'Enter a full link starting with http(s)://'; urlErrEl.style.display = 'block'; return; }
      if(MEAL_PROXY_URL.includes('YOUR-SUBDOMAIN')){
        urlErrEl.textContent = 'The meal-prep-proxy Worker is not deployed yet.'; urlErrEl.style.display = 'block'; return;
      }
      const btn = document.getElementById('pp-fetch');
      btn.disabled = true; btn.textContent = 'Fetching…';
      try{
        const data = await proxyPost('/fetch', {url}, 25000);
        document.getElementById('pp-text').value = data.text || '';
        await runParseFlow(data.text || '', btn, urlErrEl, 'Fetch');
      }catch(e){
        urlErrEl.textContent = (e.name==='AbortError' ? 'That site took too long to respond' : e.message) + ' — try the Paste text tab instead.';
        urlErrEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Fetch';
      }
    };
  });
}
// One sheet serves both entry points: the "Find recipes" spotlight (opens
// with the search focused) and the "Saved recipes" browser row. Rows filter
// live across title/protein/style; the basket button behaves exactly like
// "+ Add to week" on the main screen (week set + grocery consolidation).
function openRecipeSearchSheet(focusSearch){
  function rowHTML(r){
    const inWeek = (S.mealPrep?.activeRecipeIds || []).includes(r.id);
    const meta = [r.serves ? `Serves ${r.serves}` : '', r.minutes ? `${r.minutes} min` : '', r.source==='ai' ? 'AI' : ''].filter(Boolean).join(' · ');
    return `<div class="rs-row" data-rs-view="${r.id}">
      <div class="g-info">
        <div class="g-name">${escapeHtml(r.name)}</div>
        <div class="g-src">${meta ? escapeHtml(meta) : '&nbsp;'}</div>
      </div>
      <span class="rc-chip p">${escapeHtml(r.protein || '?')}</span>
      <button class="rs-add${inWeek ? ' on' : ''}" data-rs-week="${r.id}" aria-label="${inWeek ? 'In this week' : 'Add to grocery list'}">
        <i data-lucide="${inWeek ? 'check' : 'shopping-basket'}"></i>
      </button>
    </div>`;
  }
  function listHTML(q){
    const rows = mealRecipes.filter(r => recipeMatchesQuery(r, q));
    if(!mealRecipes.length) return `<div class="rc-none" style="margin:0">Nothing saved yet — paste a recipe or adopt an AI suggestion.</div>`;
    if(!rows.length) return `<div class="rc-none" style="margin:0">No recipes match “${escapeHtml(q)}”.</div>`;
    return rows.map(rowHTML).join('');
  }
  function bindRows(){
    document.querySelectorAll('[data-rs-view]').forEach(el => el.addEventListener('click', e => {
      if(e.target.closest('[data-rs-week]')) return;
      const r = mealRecipes.find(x => x.id === el.dataset.rsView);
      if(r) openRecipeView(r);
    }));
    document.querySelectorAll('[data-rs-week]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.rsWeek;
      commitChange(state => {
        const arr = state.mealPrep.activeRecipeIds;
        const i = arr.indexOf(id);
        if(i >= 0) arr.splice(i, 1); else arr.push(id);
        regenerateGrocery(state);
      });
      const on = el.classList.toggle('on');
      el.innerHTML = `<i data-lucide="${on ? 'check' : 'shopping-basket'}"></i>`;
      lucide.createIcons();
      if(currentTab === 'meals') renderMeals(); // keep the weekbar behind the sheet current
    }));
  }
  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">Saved recipes</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    <input class="plain-input" id="rs-q" placeholder="Search title, protein, style…" autocomplete="off">
    <div id="rs-list">${listHTML('')}</div>`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    const q = document.getElementById('rs-q');
    q.addEventListener('input', ()=>{
      document.getElementById('rs-list').innerHTML = listHTML(q.value.trim());
      lucide.createIcons();
      bindRows();
    });
    bindRows();
    if(focusSearch) q.focus();
  });
}

// Unit suggestions for the ingredient unit field — free text with these
// offered; grocery consolidation normalizes aliases via normUnit anyway.
const ING_UNIT_SUGGEST = ['g','kg','ml','l','cup','tbsp','tsp','clove','can','bunch','head','slice','piece','pack'];

// One shared recipe form serves three jobs: reviewing a fresh parse
// (via 'ai'/'heuristic'), editing a saved recipe (via 'edit'), and the
// "Enter manually" tab of Add a recipe (via 'manual'). Returns {html, bind}
// so it can live in its own sheet or inside another sheet's tab pane.
function recipeFormParts(recipe, via){
  const isEdit = via === 'edit';
  const mp = S.mealPrep || {style:null};
  const options = proteinOptions();
  // The parse never silently creates a tag: a new one is badged here and
  // only becomes real when you save.
  let selProtein = recipe.protein || '';
  const parsedIsNew = !!recipe.proteinIsNew && !!selProtein;
  let selStyles = isEdit ? (recipe.styles || []).slice() : (mp.style ? [mp.style] : []);

  const chipRow = options.map(p =>
    `<button class="pk-chip${normalizeProtein(p)===normalizeProtein(selProtein)?' on':''}" data-pr-protein="${escapeHtml(p)}">${escapeHtml(p)}</button>`
  ).join('') + (parsedIsNew ? `<button class="pk-chip on newtag" data-pr-protein="${escapeHtml(selProtein)}">${escapeHtml(selProtein)} · new</button>` : '');

  // Ingredients edit as three fields per row — amount, unit, item — so
  // nobody has to know a "qty unit item" string convention. Steps stay
  // one auto-growing text row each.
  const ingRowHTML = ing => `<div class="ln-row">
      <input class="ln-input ing-qty" inputmode="decimal" placeholder="Qty" autocomplete="off" value="${escapeHtml(ing.qty != null ? fmtQty(ing.qty) : '')}">
      <input class="ln-input ing-unit" list="ing-units" placeholder="Unit" autocomplete="off" autocapitalize="none" value="${escapeHtml(ing.unit || '')}">
      <textarea class="ln-input ing-item" rows="1" placeholder="Ingredient">${escapeHtml(ing.item || '')}</textarea>
      <button class="ln-del" aria-label="Remove line"><i data-lucide="x"></i></button>
    </div>`;
  const stepRowHTML = (val, n) => `<div class="ln-row">
      <span class="ln-num">${n}</span>
      <textarea class="ln-input" rows="1" placeholder="Describe this step…">${escapeHtml(val)}</textarea>
      <button class="ln-del" aria-label="Remove line"><i data-lucide="x"></i></button>
    </div>`;
  const ings     = (recipe.ingredients||[]).slice();
  const stepVals = (recipe.steps||[]).slice();
  if(!ings.length)     ings.push({});
  if(!stepVals.length) stepVals.push('');

  const html = `
    ${via==='heuristic' ? '<div class="rc-none err" style="margin:0">The AI parse failed, so this is a rough text-scan — double-check every field.</div>' : ''}
    <div class="frm-sec">
      <div class="seg-lbl">Title</div>
      <input class="plain-input" id="pr-name" value="${escapeHtml(recipe.name||'')}">
    </div>
    <div class="frm-sec">
      <div class="seg-lbl">Protein tag ${parsedIsNew ? '<span style="color:var(--sky-deep);text-transform:none;letter-spacing:0"> — new tag: joins the picker when you save</span>' : ''}</div>
      <div class="pk-row frm-chips" id="pr-proteins">${chipRow}</div>
      <input class="plain-input" id="pr-protein-custom" placeholder="Or type a different tag…">
    </div>
    <div class="frm-sec">
      <div class="seg-lbl">Prep styles <span style="text-transform:none;letter-spacing:0">(optional)</span></div>
      <div class="pk-row frm-chips">
        ${MEAL_STYLES.map(s => `<button class="pk-chip${selStyles.includes(s.id)?' on':''}" data-pr-style="${s.id}">${s.name}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><div class="seg-lbl" style="margin-bottom:8px">Serves</div>
        <input class="plain-input" id="pr-serves" type="number" min="1" max="24" value="${recipe.serves ?? ''}"></div>
      <div style="flex:1"><div class="seg-lbl" style="margin-bottom:8px">Minutes</div>
        <input class="plain-input" id="pr-minutes" type="number" min="1" max="1440" value="${recipe.minutes ?? ''}"></div>
    </div>
    <div class="frm-sec rule">
      <div class="seg-lbl">Ingredients <span style="text-transform:none;letter-spacing:0">— amount · unit · item</span></div>
      <datalist id="ing-units">${ING_UNIT_SUGGEST.map(u => `<option value="${u}"></option>`).join('')}</datalist>
      <div class="ln-rows" id="pr-ing-rows">${ings.map(ingRowHTML).join('')}</div>
      <button class="ln-add" id="pr-ing-add"><i data-lucide="plus"></i>Add ingredient</button>
    </div>
    <div class="frm-sec rule">
      <div class="seg-lbl">Steps</div>
      <div class="ln-rows" id="pr-step-rows">${stepVals.map((v,i) => stepRowHTML(v, i+1)).join('')}</div>
      <button class="ln-add" id="pr-step-add"><i data-lucide="plus"></i>Add step</button>
    </div>
    <div class="rc-none err" id="pr-err" style="display:none;margin:0"></div>
    <button class="btn-primary" id="pr-save"><i data-lucide="check"></i>${isEdit ? 'Save changes' : 'Save recipe'}</button>`;

  function bind(){
    // Line-row plumbing: auto-grow textareas, per-row delete, append-and-focus
    function bindLines(wrapId, addId, makeRow){
      const wrap = document.getElementById(wrapId);
      const renum = ()=> wrap.querySelectorAll('.ln-num').forEach((n,i)=> n.textContent = i+1);
      const grow = t => { t.style.height='auto'; t.style.height = t.scrollHeight+'px'; };
      const bindRow = row => {
        row.querySelectorAll('textarea.ln-input').forEach(t => {
          t.addEventListener('input', ()=> grow(t));
          grow(t);
        });
        row.querySelector('.ln-del').onclick = ()=>{ row.remove(); renum(); };
      };
      wrap.querySelectorAll('.ln-row').forEach(bindRow);
      document.getElementById(addId).onclick = ()=>{
        wrap.insertAdjacentHTML('beforeend', makeRow(wrap.children.length+1));
        const row = wrap.lastElementChild;
        bindRow(row);
        lucide.createIcons();
        (row.querySelector('.ing-qty') || row.querySelector('.ln-input')).focus();
      };
    }
    bindLines('pr-ing-rows', 'pr-ing-add', ()=> ingRowHTML({}));
    bindLines('pr-step-rows', 'pr-step-add', n => stepRowHTML('', n));
    const customInput = document.getElementById('pr-protein-custom');
    document.querySelectorAll('[data-pr-protein]').forEach(el => el.addEventListener('click', ()=>{
      selProtein = el.dataset.prProtein;
      customInput.value = ''; // chip choice wins over any typed tag
      document.querySelectorAll('[data-pr-protein]').forEach(e => e.classList.toggle('on', e===el));
    }));
    // Typing a tag deselects the chips — the typed value wins on save.
    customInput.addEventListener('input', ()=>{
      if(customInput.value.trim()){
        document.querySelectorAll('[data-pr-protein]').forEach(e => e.classList.remove('on'));
      }
    });
    document.querySelectorAll('[data-pr-style]').forEach(el => el.addEventListener('click', ()=>{
      const id = el.dataset.prStyle;
      const i = selStyles.indexOf(id);
      if(i >= 0) selStyles.splice(i, 1); else selStyles.push(id);
      el.classList.toggle('on', i < 0);
    }));
    document.getElementById('pr-save').onclick = ()=>{
      const name = document.getElementById('pr-name').value.trim();
      if(!name){ document.getElementById('pr-name').focus(); return; }
      // A typed tag overrides the chip selection; typing it is the explicit
      // confirmation, so it never creates a tag silently.
      const typed = customInput.value.trim();
      const chosen = typed || (document.querySelector('#pr-proteins .pk-chip.on') ? selProtein : '');
      if(!chosen){ customInput.focus(); return; }
      // If an edited/custom tag normalizes onto an existing option, snap to it
      const match = proteinOptions().find(p => normalizeProtein(p) === normalizeProtein(chosen));
      // Three-field rows collect straight into the stored shape — a row
      // with no item text is treated as blank and dropped.
      const ingredients = [...document.querySelectorAll('#pr-ing-rows .ln-row')].map(row => {
        const item = row.querySelector('.ing-item').value.trim();
        if(!item) return null;
        return {
          qty:  parseQtyToken(row.querySelector('.ing-qty').value.trim()),
          unit: row.querySelector('.ing-unit').value.trim().toLowerCase() || null,
          item,
        };
      }).filter(Boolean);
      const steps = [...document.querySelectorAll('#pr-step-rows .ln-input')]
        .map(t => t.value.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
      const saveBtn = document.getElementById('pr-save');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      const doc = {
        name, protein: match || chosen, styles: selStyles,
        serves: parseInt(document.getElementById('pr-serves').value) || null,
        minutes: parseInt(document.getElementById('pr-minutes').value) || null,
        ingredients, steps,
        source: isEdit ? (recipe.source || 'pasted') : (via === 'manual' ? 'manual' : 'pasted'),
        createdAt: isEdit ? (recipe.createdAt || Date.now()) : Date.now(),
      };
      // Surface failures instead of a console-only catch (root cause of the
      // "lamb tag never appeared" bug: production rules rejected the write
      // and nothing told you).
      RECIPES.doc(isEdit ? recipe.id : uid()).set(doc).then(() => {
        if(isEdit){
          // Optimistic cache update so the grocery regen and the reopened
          // list see the new version before the snapshot round-trips.
          const updated = {id: recipe.id, ...doc};
          const i = mealRecipes.findIndex(x => x.id === recipe.id);
          if(i >= 0) mealRecipes[i] = updated;
          if((S.mealPrep?.activeRecipeIds || []).includes(recipe.id)){
            commitChange(state => regenerateGrocery(state, {[recipe.id]: updated}));
          }
          openRecipeSearchSheet(false);
        } else {
          closeSheet();
        }
        renderMeals(); // listener refreshes the cache; picker options update with any new tag
      }).catch(err => {
        const errEl = document.getElementById('pr-err');
        if(errEl){ errEl.textContent = 'Save failed: ' + (err.message || err); errEl.style.display = 'block'; }
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="check"></i>' + (isEdit ? 'Save changes' : 'Save recipe');
        lucide.createIcons();
      });
      return;
    };
  }
  return {html, bind};
}

function openParseReviewSheet(recipe, via){
  const form = recipeFormParts(recipe, via);
  openSheet(`
    <div class="grabber"></div>
    <div class="sheet-head">
      <div class="sheet-title">${via === 'edit' ? 'Edit recipe' : 'Check the parse'}</div>
      <button class="sheet-close" id="sh-close"><i data-lucide="x"></i></button>
    </div>
    ${form.html}`,
  ()=>{
    document.getElementById('sh-close').onclick = closeSheet;
    form.bind();
  });
}

/* ════════════════════════════════════════ TAB SWITCHING */
let currentTab = 'tasks';
let currentRoomDetail = null;
let tasksSubView = 'tasks'; // 'tasks' | 'rooms' | 'roomDetail' | 'history'
let mealSubView = 'recipes'; // 'recipes' | 'grocery'
let isHdrCollapsed = false;
const RENDERERS = {tasks:renderTasks, history:renderHistory, calendar:renderCalendar, dates:renderDates, meals:renderMeals, settings:renderSettings};

function switchTab(tab){
  isHdrCollapsed = false;
  currentTab = tab;
  currentRoomDetail = null;
  tasksSubView = 'tasks';
  mealSubView = 'recipes';
  statsSubView = 'tasks';
  mealStylePicking = false;
  mealResults = null;
  // Meals is day-only: the body class forces the day token set (dimmed at
  // night) for the tab AND its overlays. Other tabs keep global theming.
  document.body.classList.toggle('meals', tab==='meals');
  // Reset header state instantly (no animation) when switching tabs
  const prevHdr = document.querySelector('#hdr .tasks-hdr');
  if(prevHdr){
    prevHdr.style.transition='none'; prevHdr.style.height='';
    prevHdr.style.paddingTop=''; prevHdr.style.paddingBottom='';
    prevHdr.classList.remove('collapsing','scrolled');
  }
  const panel = document.getElementById('panel');
  panel.style.transition = 'none';
  panel.style.paddingTop = '';
  panel.scrollTop = 0;
  document.getElementById('mini-hdr')?.classList.remove('visible');
  document.querySelectorAll('.ni').forEach(n => n.classList.toggle('active', n.dataset.tab===tab));
  RENDERERS[tab]?.();
  // Re-enable transitions after layout settles
  requestAnimationFrame(() => {
    panel.style.transition = '';
    const hdr = document.querySelector('#hdr .tasks-hdr');
    if(hdr) hdr.style.transition = '';
  });
}

/* ════════════════════════════════════════ BOOT */
const setupEl       = document.getElementById('setup');
const appEl         = document.getElementById('app');
const setupCreateEl = document.getElementById('setup-create');
const setupRolePickEl = document.getElementById('setup-rolepick');
// Only set to true when the user explicitly completes setup in this session.
// Prevents Firebase snapshot from auto-dismissing the onboarding screen.
let sessionSetupComplete = false;
// True once the first Firestore read has told us whether a household already
// exists remotely, so we know whether to show the create-household form or
// the role picker (see boot logic below).
let firstSnapshotHandled = false;

function enterApp(){
  setupEl.style.display='none';
  appEl.hidden=false;
  lucide.createIcons();
  switchTab('tasks');
}

// Shown when this device already knows about an existing household (another
// device completed Setup) but hasn't been told which partner it belongs to
// yet. Picking a name only sets the local role — it never touches S.
function renderRolePick(){
  setupCreateEl.classList.add('hidden');
  setupRolePickEl.classList.remove('hidden');
  setupRolePickEl.innerHTML = `
    <p class="field-label" style="text-align:center;margin:0 0 2px">Which one of you is this?</p>
    <p class="setup-opt-note" style="margin-bottom:6px">This just personalises this device — it won't change anything shared.</p>
    <button class="btn-primary" id="pick-role-1">${escapeHtml(S.name1)}</button>
    <button class="btn-primary" id="pick-role-2">${escapeHtml(S.name2)}</button>`;
  const choose = role => { myRole = role; saveRole(role); sessionSetupComplete = true; enterApp(); };
  document.getElementById('pick-role-1').onclick = () => choose('name1');
  document.getElementById('pick-role-2').onclick = () => choose('name2');
}

// Boot instantly from localStorage
S = deepMerge(defaultState(), loadLocal() || {});
lucide.createIcons();
if(S.setup){
  // Returning device — preserve today's behaviour exactly. Devices that
  // completed Setup before the per-device role concept existed default to
  // 'name1', matching what they've always effectively been.
  if(!myRole){ myRole = 'name1'; saveRole(myRole); }
  sessionSetupComplete = true;
  setupEl.style.display='none';
  appEl.hidden=false;
  switchTab('tasks');
} else {
  // Fresh device: don't know yet whether this is the very first-ever setup
  // (show the create-household form) or a second device joining a household
  // that already exists (show the role picker instead). Hide the form until
  // the first Firestore read tells us which — with a timeout fallback in
  // case that read never arrives (e.g. genuinely offline first launch).
  setupCreateEl.classList.add('hidden');
  setTimeout(() => {
    // Deliberately doesn't set firstSnapshotHandled — this is just a visible
    // fallback so the screen isn't blank while offline. If a real snapshot
    // arrives later and turns out to show an existing household, the
    // onSnapshot handler below still swaps this out for the role picker.
    if(!firstSnapshotHandled && !sessionSetupComplete){
      setupCreateEl.classList.remove('hidden');
    }
  }, 4000);
}

// Firestore rules require an authenticated request, so sign in anonymously
// first and only attach the sync listener once that succeeds. Anonymous
// sessions persist on-device, so this is instant on repeat launches.
let householdSyncStarted = false;
function startHouseholdSync(){
  if(householdSyncStarted) return;
  householdSyncStarted = true;
  startRecipesSync();
  // Firebase syncs data silently — only transitions UI if setup was already complete this session
  HOUSEHOLD.onSnapshot(snap => {
    // Skip the optimistic local echo of our own writes — only act on
    // server-confirmed data, so a single save doesn't trigger extra
    // redundant re-renders on top of the one the action already did.
    if(snap.metadata.hasPendingWrites) return;
    const remoteHouseholdReady = snap.exists && !!(snap.data() || {}).setup;
    // When the server confirms exactly what we already rendered (the ack of
    // our own write arriving a beat later), skip the re-render: that delayed
    // full rebuild was the main "scroll suddenly jumps seconds after I did
    // something" bug. A genuinely different payload (partner's edit) still
    // re-renders below.
    let unchanged = false;
    if(snap.exists){
      const incoming = deepMerge(defaultState(), snap.data());
      unchanged = stableStr(incoming) === stableStr(S);
      S = incoming;
      saveLocal();
    } else {
      HOUSEHOLD.set(S);
    }
    if(!sessionSetupComplete){
      // Re-checked on every snapshot, not just the first: a slow first read
      // could otherwise leave a straggling device stuck on the create-form
      // fallback even after the real household data confirms one exists.
      if(remoteHouseholdReady){
        if(setupRolePickEl.classList.contains('hidden')) renderRolePick();
      } else if(!firstSnapshotHandled){
        setupCreateEl.classList.remove('hidden');
      }
    }
    firstSnapshotHandled = true;
    if(sessionSetupComplete){
      if(appEl.hidden){
        enterApp();
      } else if(!unchanged){
        RENDERERS[currentTab]?.();
      }
    }
    // If !sessionSetupComplete, user is on the onboarding screen — don't auto-dismiss
  }, err => {
    console.error('Firestore sync error:', err);
  });
}

firebase.auth().onAuthStateChanged(user => {
  if(user) startHouseholdSync();
});

// signInAnonymously() has no built-in retry — a device that's offline at the
// exact moment it loads would otherwise fail once and be stuck (on the
// create-form fallback, or blank) until a manual page reload. Retry with
// backoff, and immediately whenever the browser regains connectivity.
let signInRetryDelay = 2000;
const SIGN_IN_MAX_RETRY_DELAY = 30000;
function attemptSignIn(){
  if(householdSyncStarted) return; // already signed in and syncing
  firebase.auth().signInAnonymously().catch(err => {
    console.error(`Anonymous sign-in failed, retrying in ${signInRetryDelay}ms:`, err);
    setTimeout(attemptSignIn, signInRetryDelay);
    signInRetryDelay = Math.min(signInRetryDelay * 2, SIGN_IN_MAX_RETRY_DELAY);
  });
}
attemptSignIn();
window.addEventListener('online', attemptSignIn);

document.getElementById('setup-go').addEventListener('click', ()=>{
  const n1=document.getElementById('inp-name1').value.trim();
  const n2=document.getElementById('inp-name2').value.trim();
  if(!n1||!n2){ alert('Please enter both names.'); return; }
  const email1 = document.getElementById('inp-email1')?.value.trim()||'';
  const email2 = document.getElementById('inp-email2')?.value.trim()||'';
  myRole = 'name1'; saveRole(myRole);
  sessionSetupComplete = true;
  commitChange(state => {
    state.name1=n1; state.name2=n2; state.setup=true;
    state.email1=email1; state.email2=email2;
  });
  enterApp();
});

document.querySelectorAll('.ni').forEach(btn =>
  btn.addEventListener('click', ()=> switchTab(btn.dataset.tab))
);

function initScrollCollapse(){
  // Bind mini-header buttons (static in HTML, so bind once at boot)
  const mhAdd = document.getElementById('mh-add-btn');
  if(mhAdd) mhAdd.onclick = openAddTaskSheet;
  const mhTasks = document.getElementById('mh-tasks-btn');
  if(mhTasks) mhTasks.onclick = ()=>{ tasksSubView='tasks'; currentRoomDetail=null; renderTasks(); };
  const mhRooms = document.getElementById('mh-rooms-btn');
  if(mhRooms) mhRooms.onclick = ()=>{ tasksSubView='rooms'; currentRoomDetail=null; renderTasks(); };
  const mhHist = document.getElementById('mh-hist-btn');
  if(mhHist) mhHist.onclick = ()=>{
    tasksSubView='history'; currentRoomDetail=null; renderTasks();
    document.getElementById('panel').scrollTop = 0;
  };

  const panel   = document.getElementById('panel');
  const miniHdr = document.getElementById('mini-hdr');
  const DURATION = 320;
  let lastY = 0, upAccum = 0;
  // While a collapse/expand transition is in flight, the panel's geometry
  // (clientHeight, paddingTop) changes every frame and the browser clamps
  // scrollTop to the moving bounds — firing scroll events that read exactly
  // like user swipes. Flipping state off those mid-animation deltas is what
  // bounced the header straight back open (the rubber-band jolt).
  let hdrAnimUntil = 0;

  function getHdr(){ return document.querySelector('#hdr .tasks-hdr'); }

  // border-box height can never render below the element's own padding, and
  // .tasks-hdr carries the safe-area inset in its padding-top (~50px on a
  // notched phone, 0 in a desktop viewport). Animating height alone slammed
  // into that padding floor partway down and stopped dead — the "header
  // jumps on a real phone" bug. Padding must animate to 0 alongside height.
  const HDR_TRANSITION = `height ${DURATION}ms cubic-bezier(.4,0,.2,1), padding ${DURATION}ms cubic-bezier(.4,0,.2,1), box-shadow ${DURATION}ms ease, border-radius ${DURATION}ms ease`;

  function collapseHdr(){
    if(isHdrCollapsed) return;
    const hdr = getHdr(); if(!hdr) return;
    // Collapsing grows the panel's viewport by the header's full height (the
    // header is a flex sibling) and adds the mini-header's height as top
    // padding. On a short list the collapsed layout's max scroll can't keep
    // scrollTop past the toggle row — the browser clamps it the moment the
    // header shrinks, which either re-expands mid-flight (jolt) or strands
    // the mini-header stacked over the in-panel toggle (double toggle).
    // Only collapse when the collapsed layout leaves real scroll runway:
    // 60px collapse threshold + 60px expand accumulator + margin.
    const maxScrollAfter = panel.scrollHeight + miniHdr.offsetHeight - (panel.clientHeight + hdr.offsetHeight);
    if(maxScrollAfter < 130) return;
    isHdrCollapsed = true;
    hdrAnimUntil = performance.now() + DURATION + 80;
    // Lock current pixel height, then animate height AND padding to 0
    const fullH = hdr.offsetHeight;
    hdr.style.transition = 'none';
    hdr.style.height = fullH + 'px';
    hdr.classList.add('collapsing');
    hdr.offsetHeight; // force reflow so transition applies on next frame
    hdr.style.transition = HDR_TRANSITION;
    hdr.style.height = '0';
    hdr.style.paddingTop = '0px';
    hdr.style.paddingBottom = '0px';
    miniHdr.classList.add('visible');
    // Pad the panel top so list content stays visible below the mini-header
    panel.style.paddingTop = miniHdr.offsetHeight + 'px';
  }

  function expandHdr(){
    if(!isHdrCollapsed) return;
    isHdrCollapsed = false;
    upAccum = 0;
    hdrAnimUntil = performance.now() + DURATION + 80;
    const hdr = getHdr(); if(!hdr) return;
    // Measure natural height (with natural padding): set auto, read, then
    // animate from the fully collapsed 0/0 state back up
    hdr.style.transition = 'none';
    hdr.style.height = 'auto';
    hdr.style.paddingTop = '';
    hdr.style.paddingBottom = '';
    const fullH = hdr.offsetHeight;
    const cs = getComputedStyle(hdr);
    const padT = cs.paddingTop, padB = cs.paddingBottom;
    hdr.style.height = '0';
    hdr.style.paddingTop = '0px';
    hdr.style.paddingBottom = '0px';
    hdr.offsetHeight; // reflow
    hdr.classList.remove('collapsing');
    hdr.style.transition = HDR_TRANSITION;
    hdr.style.height = fullH + 'px';
    hdr.style.paddingTop = padT;
    hdr.style.paddingBottom = padB;
    miniHdr.classList.remove('visible');
    panel.style.paddingTop = '0';
    // After animation, remove inline styles so the header can reflow naturally
    setTimeout(() => {
      if(!isHdrCollapsed){
        hdr.style.height = ''; hdr.style.transition = '';
        hdr.style.paddingTop = ''; hdr.style.paddingBottom = '';
      }
    }, DURATION + 20);
  }

  panel.addEventListener('scroll', function(){
    // Always track position first — early-returning before updating lastY
    // leaves a stale value that swallows the first delta back on this tab.
    // Clamp iOS rubber-band overscroll: the bounce reports out-of-range
    // scrollTops whose snap-back reads as a large fake swipe and flips the
    // collapse state mid-bounce on fast repeated scrolling.
    const y = Math.min(Math.max(this.scrollTop, 0), Math.max(this.scrollHeight - this.clientHeight, 0));
    const delta = y - lastY;
    lastY = y;
    // Programmatic wipe+restore in flight (setPanelHTML): sync position
    // only — these events are not user scrolling and their deltas must
    // never flip the collapse state.
    if(performance.now() < panelScrollGuardUntil) return;
    // Collapse/expand transition in flight: the geometry-clamp scroll events
    // it emits must sync position only, never flip the state back (see above).
    if(performance.now() < hdrAnimUntil) return;
    if(currentTab !== 'tasks') return;
    // Rooms/room-detail/history use the compact static header — no collapse.
    if(tasksSubView !== 'tasks') return;
    // Permanent-compact mode has no big header to collapse or expand.
    if(alwaysCompactHdr()) return;
    if(delta > 0){
      // Scrolling down — reset upward accumulator and collapse when past threshold
      upAccum = 0;
      if(y > 60 && !isHdrCollapsed) collapseHdr();
    } else if(delta < 0){
      // Scrolling up — only expand after 60px of intentional upward movement
      upAccum += -delta;
      if(upAccum >= 60 && isHdrCollapsed) expandHdr();
    }
  }, {passive:true});
}
initScrollCollapse();
lucide.createIcons(); // render mini-hdr icons
