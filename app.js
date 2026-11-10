'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let ME = null, CFG = {}, es = null, view = null;

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
  return j;
}
function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 5000); }
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const when = (t) => (t ? new Date(t).toLocaleString() : '—');
const pill = (s) => { const m = { verified: 'p-g', hired: 'p-g', retained: 'p-g', available: 'p-b', applied: 'p-b', shortlisted: 'p-b', interview: 'p-a', offer: 'p-a', locked: 'p-x', rejected: 'p-r' }; return `<span class="pill ${m[s] || 'p-x'}">${esc(s)}</span>`; };

// ---------- realtime ----------
function connect() {
  if (es) es.close();
  es = new EventSource('/api/events');
  const reload = () => view && view();
  es.addEventListener('application', (e) => { const d = JSON.parse(e.data); toast(`New applicant: ${d.name} → ${d.job}`); if (location.hash.startsWith('#/e/')) reload(); });
  es.addEventListener('status', (e) => { const d = JSON.parse(e.data); if (ME.role === 'learner') { toast(`Your application for ${d.job} is now: ${d.status}`); if (location.hash.startsWith('#/apps')) reload(); } else feed(`status → ${d.status}`); });
  es.addEventListener('skill', (e) => { const d = JSON.parse(e.data); toast('Skill verified. Credential ' + d.cred + ' issued.'); });
  for (const n of ['signup', 'attempt', 'skill_verified', 'apply', 'passport', 'job']) es.addEventListener(n, (e) => { const d = JSON.parse(e.data); feed(n.replace('_', ' ') + (d.correct === false ? ' (failed)' : '')); if (location.hash === '#/admin') { clearTimeout(connect.t); connect.t = setTimeout(reload, 400); } });
}
function feed(text) { const f = $('#feed'); if (!f) return; const li = document.createElement('div'); li.textContent = new Date().toLocaleTimeString() + '  ' + text; f.prepend(li); while (f.children.length > 30) f.lastChild.remove(); }

// ---------- shell ----------
function shell() {
  const nav = $('#nav'); const who = $('#who');
  const docs = '<span style="flex:1"></span><a href="docs/deck.html" target="_blank">Pitch deck ↗</a><a href="docs/validation.html" target="_blank">Founder validation ↗</a><a href="docs/grilling.html" target="_blank">Investor Q&amp;A ↗</a>';
  if (!ME) { nav.innerHTML = docs; who.innerHTML = ''; return; }
  const links =ME.role === 'learner' ? [['dash', 'My path'], ['jobs', 'Jobs'], ['apps', 'Applications'], ['creds', 'Credentials']]
    : ME.role === 'employer' ? [['e/jobs', 'My jobs'], ['e/pipe', 'Pipeline']] : [['admin', 'Metrics']];
  nav.innerHTML = links.map(([h, t]) => `<a href="#/${h}" class="${location.hash.startsWith('#/' + h) ? 'on' : ''}">${t}</a>`).join('') + docs;
  who.dataset.initial = (ME.name || '?').trim()[0].toUpperCase();
  who.innerHTML = `<span>${esc(ME.name)} · ${ME.role}</span><button class="ghost sm" id="out">Sign out</button>`;
  $('#out').onclick = async () => { await api('POST', '/api/logout'); ME = null; if (es) es.close(); location.hash = ''; boot(); };
}

// ---------- auth ----------
function authView() {
  view = null; let role = 'learner', mode = 'register';
  const draw = () => {
    app.innerHTML = `<div class="hero"><div><div class="eyebrow">From learning to earning</div>
    <h1>Prove your skills.<br><em>Get hired</em> on evidence.</h1>
    <p class="lead">Learn Junior Data Analyst skills with an AI tutor, pass graded tasks on your own unique dataset, earn a credential anyone can verify, and apply to employers who only pay when a hire sticks.</p>
    <div class="steps"><span>Learn</span><span>Prove</span><span>Credential</span><span>Match</span><span>Hired</span></div>
    <div class="proof"><div><b>6</b><small>graded skills</small></div><div><b>Ed25519</b><small>signed credentials</small></div><div><b>₹0</b><small>cost to learners</small></div></div></div>
    <div class="auth"><h2>${mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
    <div class="tabs"><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Create account</button><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button></div>
    ${mode === 'register' ? `<div class="tabs"><button data-r="learner" class="${role === 'learner' ? 'on' : ''}">I'm a learner</button><button data-r="employer" class="${role === 'employer' ? 'on' : ''}">I'm hiring</button></div>
    <label>Name</label><input id="name">${role === 'employer' ? '<label>Company</label><input id="org">' : ''}` : ''}
    <label>Email</label><input id="email" type="email"><label>Password (8+ characters)</label><input id="pw" type="password">
    <p class="err" id="err"></p><button id="go" style="width:100%;margin-top:6px">${mode === 'register' ? 'Create account' : 'Sign in'}</button>
    <div class="demo"><b>Demo logins</b> <span class="muted small">(password for both: <code>demo-pass-123</code>)</span>
    <div class="row" style="margin-top:8px"><button class="ghost sm" data-demo="learner@demo.edusync.test">Learner · learner@demo.edusync.test</button><button class="ghost sm" data-demo="hiring@demo.edusync.test">Employer · hiring@demo.edusync.test</button><button class="ghost sm" data-demo="admin@edusync.local" data-pw="admin-demo-123">Admin · admin@edusync.local</button></div>
    <p class="small muted" style="margin:8px 0 0">Click one to sign in instantly. Demo accounts are excluded from the real metrics.</p></div></div></div>`;
    $$('[data-demo]').forEach((b) => (b.onclick = async () => {
      try { ME = (await api('POST', '/api/login', { email: b.dataset.demo, password: b.dataset.pw || 'demo-pass-123' })).user; location.hash = ''; boot(); } catch (e) { $('#err').textContent = e.message; }
    }));
    $$('[data-m]').forEach((b) => (b.onclick = () => { mode = b.dataset.m; draw(); }));
    $$('[data-r]').forEach((b) => (b.onclick = () => { role = b.dataset.r; draw(); }));
    $('#go').onclick = async () => {
      try {
        const body = { email: $('#email').value, password: $('#pw').value };
        if (mode === 'register') { body.name = $('#name').value; body.role = role; if (role === 'employer') body.org = $('#org').value; }
        ME = (await api('POST', mode === 'register' ? '/api/register' : '/api/login', body)).user; location.hash = ''; boot();
      } catch (e) { $('#err').textContent = e.message; }
    };
    app.onkeydown = (e) => { if (e.key === 'Enter') $('#go').click(); };
  };
  draw();
}

// ---------- learner ----------
async function dashView() {
  view = dashView;
  const [{ skills, passport }, { creds }, { applications }] = await Promise.all([api('GET', '/api/skills'), api('GET', '/api/creds'), api('GET', '/api/applications')]);
  const done = skills.filter((s) => s.status === 'verified').length; const all = done === skills.length;
  const pos = Object.fromEntries(skills.map((s) => [s.id, s]));
  const edges = skills.flatMap((s) => s.pre.map((p) => `<line x1="${pos[p].x + 70}" y1="${pos[p].y + 22}" x2="${s.x - 70}" y2="${s.y + 22}" stroke="#cbd5e1" stroke-width="2" marker-end="url(#ar)"/>`)).join('');
  const col = { verified: 'url(#gv)', available: 'url(#ga)', locked: '#94a3b8' };
  const pct = Math.round(done / skills.length * 100), C = 2 * Math.PI * 40;
  const nodes = skills.map((s) => `<g class="nd" data-id="${s.id}" style="cursor:${s.status === 'locked' ? 'not-allowed' : 'pointer'}" opacity="${s.status === 'locked' ? .55 : 1}">
    <rect x="${s.x - 70}" y="${s.y - 6}" width="140" height="56" rx="12" fill="${col[s.status]}"/>
    <text x="${s.x}" y="${s.y + 15}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">${esc(s.name.length > 22 ? s.name.slice(0, 21) + '…' : s.name)}</text>
    <text x="${s.x}" y="${s.y + 34}" text-anchor="middle" fill="#fff" font-size="12" opacity=".9">${s.status === 'verified' ? '✓ verified' : s.status === 'locked' ? 'locked' : s.passed + '/' + s.need + ' needed'}</text></g>`).join('');
  app.innerHTML = `<div class="banner"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="9"/><circle cx="50" cy="50" r="40" fill="none" stroke="#5eead4" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * pct / 100} ${C}" transform="rotate(-90 50 50)"/><text x="50" y="57" text-anchor="middle" font-size="22">${pct}%</text></svg>
  <div style="position:relative;z-index:1"><div class="eyebrow" style="color:#99f6e4">Your path</div><h1>Junior Data Analyst</h1><p>Each skill unlocks only after you pass graded tasks on <b>your own</b> dataset. ${done} of ${skills.length} skills verified.</p></div></div>
  <div class="card"><svg viewBox="0 0 640 270" width="100%" class="graph"><defs><linearGradient id="gv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#14b8a6"/></linearGradient><linearGradient id="ga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5bf0"/><stop offset="1" stop-color="#7c6cf6"/></linearGradient><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#94a3b8"/></marker></defs>${edges}${nodes}</svg>
  <div class="row"><span class="sp small muted">Click a blue or green skill to learn and take its tasks.</span>
  ${all && !passport ? '<button class="teal" id="pp">Issue my Role Passport</button>' : passport ? '<span class="pill p-g">Role Passport issued</span>' : '<span class="small muted">Verify all 6 skills to unlock the Role Passport.</span>'}</div></div>
  <div class="grid g3"><div class="card"><div class="kpi">${creds.length}<small>signed credentials</small></div></div>
  <div class="card"><div class="kpi">${applications.length}<small>applications</small></div></div>
  <div class="card"><div class="kpi">${applications.filter((a) => ['hired', 'retained'].includes(a.status)).length}<small>hired</small></div></div></div>`;
  $$('.nd').forEach((n) => (n.onclick = () => { const s = pos[n.dataset.id]; if (s.status !== 'locked') location.hash = '#/skill/' + s.id; else toast('Locked. Verify: ' + s.pre.map((p) => pos[p].name).join(', ')); }));
  const pp = $('#pp'); if (pp) pp.onclick = async () => { try { const r = await api('POST', '/api/passport'); toast('Passport ' + r.id + ' issued'); dashView(); } catch (e) { toast(e.message); } };
}

async function skillView(id) {
  view = () => skillView(id);
  let d, schema;
  try { [d, { schema }] = await Promise.all([api('GET', '/api/skills/' + id), api('GET', '/api/schema')]); } catch (e) { app.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><a href="#/dash">Back</a></div>`; return; }
  const s = d.skill; const st = {};
  app.innerHTML = `<p><a href="#/dash">← My path</a></p><h1>${esc(s.name)} ${pill(s.status)}</h1><p class="muted">${esc(s.blurb)} Pass ${s.need} of ${s.total} tasks to verify this skill.</p>
  <div class="split"><div>
    <h2>Lessons</h2>${d.lessons.map((l) => `<details class="lesson"><summary>${esc(l.t)}</summary><p>${esc(l.x)}</p></details>`).join('')}
    <h2 style="margin-top:18px">Tasks <span class="small muted">(your dataset is unique to you)</span></h2>
    <div class="chips" style="margin-bottom:10px">${Object.entries(schema).map(([t, c]) => `<span class="chip" title="${esc(c.join(', '))}">${t}(${c.join(', ')})</span>`).join('')}</div>
    ${d.tasks.map((t) => `<div class="task ${t.passed ? 'done' : ''}" data-id="${t.id}" data-kind="${t.kind}"><h3>${esc(t.title)} ${t.passed ? '<span class="pill p-g">passed</span>' : ''} <span class="pill p-x">${t.kind}</span></h3><p>${esc(t.prompt)}</p>
      ${t.kind === 'num' ? '<input class="ans" placeholder="Your number"> <a class="small" href="#" data-csv="orders">download orders.csv</a>' : `<textarea class="ans" placeholder="${t.kind === 'sql' ? 'SELECT … (one statement)' : 'Write 3–5 sentences'}"></textarea>`}
      ${t.kind === 'text' ? '<div class="small muted wc">0 words</div>' : ''}
      <div class="row" style="margin-top:8px">${t.kind === 'sql' ? '<button class="ghost sm run">Run</button>' : ''}<button class="sm submit">Submit for grading</button></div><div class="out"></div><div class="res"></div></div>`).join('')}
  </div>
  <div class="card" style="position:sticky;top:70px"><h2>AI tutor</h2><p class="small muted">Answers only from approved lessons and cites them. Off-topic questions are refused. Mode: <b>offline (browser demo: retrieval only, no LLM call)</b></p>
    <div class="chat" id="chat"><div class="msg muted">Ask about SELECT, GROUP BY, JOIN, NULLs, duplicates, median…</div></div>
    <div class="row" style="margin-top:8px"><input id="q" placeholder="e.g. when do I use HAVING?" class="sp"><button id="ask">Ask</button></div></div></div>`;

  $$('.task').forEach((card) => {
    const id2 = card.dataset.id, kind = card.dataset.kind, ans = $('.ans', card);
    st[id2] = { t0: Date.now(), pastes: 0, runs: 0 };
    ans.addEventListener('paste', () => st[id2].pastes++);
    if (kind === 'text') ans.addEventListener('input', () => { $('.wc', card).textContent = (ans.value.trim().split(/\s+/).filter(Boolean).length) + ' words'; });
    const run = $('.run', card);
    if (run) run.onclick = async () => {
      st[id2].runs++; const out = $('.out', card); out.innerHTML = '<p class="small muted">Running…</p>';
      try {
        const r = await api('POST', '/api/sql/run', { sql: ans.value });
        out.innerHTML = `<div class="scroll"><table><tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${r.rows.slice(0, 100).map((x) => `<tr>${x.map((v) => `<td>${v === null ? '<i class="muted">NULL</i>' : esc(v)}</td>`).join('')}</tr>`).join('')}</table></div><p class="small muted">${r.rows.length} row(s)${r.rows.length > 100 ? ', showing 100' : ''}</p>`;
      } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    };
    $('.submit', card).onclick = async (ev) => {
      const b = ev.target; b.disabled = true; const res = $('.res', card);
      try {
        const r = await api('POST', `/api/tasks/${id2}/submit`, { answer: ans.value, pastes: st[id2].pastes, runs: st[id2].runs, secs: Math.round((Date.now() - st[id2].t0) / 1000) });
        res.innerHTML = `<div class="fb ${r.correct ? 'ok' : 'no'}">${r.correct ? '✓ ' : '✗ '}${esc(r.feedback)}${r.checks ? '<ul>' + r.checks.map((c) => `<li>${c.ok ? '✓' : '✗'} ${esc(c.name)}</li>`).join('') + '</ul>' : ''}</div>`;
        if (r.correct) card.classList.add('done');
        if (r.skillVerified) setTimeout(() => skillView(id), 1200);
      } catch (e) { res.innerHTML = `<div class="fb no">${esc(e.message)}</div>`; }
      b.disabled = false;
    };
  });

  const ask = async () => {
    const q = $('#q').value.trim(); if (!q) return; $('#q').value = '';
    const chat = $('#chat'); chat.insertAdjacentHTML('beforeend', `<div class="msg u">${esc(q)}</div>`);
    const m = document.createElement('div'); m.className = 'msg'; chat.appendChild(m); chat.scrollTop = 1e9;
    try {
      const r = await fetch('/api/tutor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) });
      if (!r.ok) throw new Error((await r.json()).error);
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2); if (!line.startsWith('data:')) continue;
          const j = JSON.parse(line.slice(5));
          if (j.t) { m.firstChild ? (m.firstChild.textContent += j.t) : m.append(j.t); }
          if (j.done) m.insertAdjacentHTML('beforeend', `<span class="src">${j.mode === 'refused' ? 'Not in curriculum — refused to guess' : (j.mode === 'claude' ? 'Claude' : 'Offline fallback') + ' · sources: ' + j.sources.map((x) => `[${x.n}] ${esc(x.title)}`).join(', ')}</span>`);
          chat.scrollTop = 1e9;
        }
      }
    } catch (e) { m.textContent = 'Error: ' + e.message; }
  };
  $('#ask').onclick = ask; $('#q').onkeydown = (e) => { if (e.key === 'Enter') ask(); };
}

async function jobsView() {
  view = jobsView;
  const { jobs } = await api('GET', '/api/jobs'); const { skills } = await api('GET', '/api/skills');
  app.innerHTML = `<h1>Open roles</h1><p class="muted">You can apply only when every required skill is verified. The server enforces this.</p>` +
    (jobs.length ? jobs.map((j) => `<div class="card row"><div class="sp"><h2>${esc(j.title)} <span class="muted small">· ${esc(j.org)} · ${esc(j.city || 'Remote')}</span></h2><div class="small muted">Salary ${money(j.salary)} / yr · requires ${j.skills.length} skill(s)</div></div>
      ${j.applied ? pill(j.applied) : j.eligible ? `<button data-j="${j.id}">Apply</button>` : '<span class="pill p-x">verify required skills first</span>'}</div>`).join('') : '<div class="card muted">No jobs yet. Employers post roles here in real time.</div>');
  $$('[data-j]').forEach((b) => (b.onclick = async () => { try { await api('POST', `/api/jobs/${b.dataset.j}/apply`); toast('Applied'); jobsView(); } catch (e) { toast(e.message); } }));
}
async function appsView() {
  view = appsView; const { applications } = await api('GET', '/api/applications');
  app.innerHTML = `<h1>My applications</h1><div class="card"><table><tr><th>Role</th><th>Company</th><th>Status</th><th>Start</th></tr>${applications.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(a.org)}</td><td>${pill(a.status)}</td><td>${a.start_date ? when(a.start_date) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None yet.</td></tr>'}</table></div><p class="small muted">Status updates arrive live when the employer changes them.</p>`;
}
async function credsView() {
  view = credsView; const { creds } = await api('GET', '/api/creds');
  app.innerHTML = `<h1>My credentials</h1><p class="muted">Each credential is signed with the eduSync issuer key (Ed25519). Anyone can verify it without logging in.</p>` +
    (creds.map((c) => `<div class="card"><div class="row"><h2 class="sp">${esc(c.payload.skill || c.payload.role)} ${c.kind === 'role' ? '<span class="pill p-b">Role Passport</span>' : ''} ${c.revoked ? '<span class="pill p-r">revoked</span>' : ''}</h2><a class="btn sm" href="#/verify/${c.id}" target="_blank">Public verify page ↗</a></div>
    <div class="small muted">ID <code>${c.id}</code> · issued ${when(c.issued_at)} · evidence hash <code>${c.payload.evidence.slice(0, 16)}…</code></div></div>`).join('') || '<div class="card muted">Verify a skill to earn your first credential.</div>');
}

// ---------- employer ----------
async function eJobsView() {
  view = eJobsView; const { jobs } = await api('GET', '/api/jobs');
  app.innerHTML = `<h1>${esc(ME.org || 'My')} jobs</h1><div class="card"><h2>Post a role</h2><div class="grid g3"><div><label>Title</label><input id="jt" value="Junior Data Analyst"></div><div><label>City</label><input id="jc" value="Chennai"></div><div><label>Annual salary (₹)</label><input id="js" type="number" value="600000"></div></div>
  <p class="small muted">Requires all 6 skills. Fee is charged only on a hire retained ${CFG.retentionDays}+ days.</p><button id="post">Post job</button> <span class="err" id="e"></span></div>
  ${jobs.map((j) => `<div class="card row"><div class="sp"><h2>${esc(j.title)}</h2><span class="small muted">${esc(j.city)} · ${money(j.salary)} · ${j.status}</span></div></div>`).join('')}`;
  $('#post').onclick = async () => { try { await api('POST', '/api/jobs', { title: $('#jt').value, city: $('#jc').value, salary: $('#js').value }); toast('Job posted'); eJobsView(); } catch (e) { $('#e').textContent = e.message; } };
}
async function ePipeView() {
  view = ePipeView; const { applications, retentionDays } = await api('GET', '/api/employer/applications');
  const next = { applied: 'shortlisted', shortlisted: 'interview', interview: 'offer', offer: 'hired', hired: 'retained' };
  const fee = applications.filter((a) => a.status === 'retained').reduce((s, a) => s + a.fee, 0);
  app.innerHTML = `<h1>Hiring pipeline <span class="live"></span></h1><div class="grid g3"><div class="card"><div class="kpi">${applications.length}<small>candidates</small></div></div><div class="card"><div class="kpi">${applications.filter((a) => ['hired', 'retained'].includes(a.status)).length}<small>hired</small></div></div><div class="card"><div class="kpi">${money(fee)}<small>fees owed (retained hires only)</small></div></div></div>
  <div class="card"><table><tr><th>Candidate</th><th>Role</th><th>Status</th><th>Action</th></tr>${applications.map((a) => {
    const n = next[a.status]; const early = n === 'retained' && Date.now() < a.retainedEligibleAt;
    return `<tr><td><a href="#" class="cv" data-u="${a.user_id}">${esc(a.name)}</a></td><td>${esc(a.title)}<br><span class="small muted">${money(a.salary)}</span></td><td>${pill(a.status)}${a.fee ? `<br><span class="small">fee ${money(a.fee)}</span>` : ''}</td>
    <td>${n ? `<button class="sm adv" data-a="${a.id}" data-s="${n}" ${early ? 'disabled' : ''}>${early ? 'Retention check ' + new Date(a.retainedEligibleAt).toLocaleDateString() : 'Move to ' + n}</button>` : ''} ${['applied', 'shortlisted', 'interview', 'offer'].includes(a.status) ? `<button class="sm ghost adv" data-a="${a.id}" data-s="rejected">Reject</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">No applicants yet. They appear here live.</td></tr>'}</table></div><div id="cand"></div><p class="small muted">Retention window: ${retentionDays} day(s). "Retained" is the Verified Outcome and the only event that creates a fee.</p>`;
  $$('.adv').forEach((b) => (b.onclick = async () => { try { await api('POST', `/api/applications/${b.dataset.a}/status`, { status: b.dataset.s }); ePipeView(); } catch (e) { toast(e.message); } }));
  $$('.cv').forEach((a) => (a.onclick = async (ev) => {
    ev.preventDefault(); const c = await api('GET', '/api/employer/candidate/' + a.dataset.u); const i = c.integrity;
    $('#cand').innerHTML = `<div class="card"><h2>${esc(c.candidate.name)}</h2><div class="grid g2"><div><h3>Credentials</h3>${c.credentials.map((x) => `<div class="small"><a href="#/verify/${x.id}" target="_blank">${x.id}</a> · ${esc(x.kind)} ${x.revoked ? pill('rejected') : ''}</div>`).join('')}</div>
    <div><h3>Integrity signals</h3><div class="small">Attempts ${i.attempts} (${i.correct} correct) · pasted ${i.pastes}× · median ${i.medianSecs}s/task · ${i.avgRuns} runs/task<br><span class="muted">${esc(i.note)}</span></div></div></div></div>`;
  }));
}

// ---------- admin ----------
async function adminView() {
  view = adminView; const m = await api('GET', '/api/admin/metrics'); const max = Math.max(1, ...m.funnel.map((f) => f.v));
  app.innerHTML = `<h1>Founder metrics <span class="live"></span></h1><p class="muted">Real users only. ${m.demoAccountsExcluded} demo account(s) excluded. The only number that matters is the last bar.</p>
  <div class="split"><div class="card"><h2>Funnel</h2>${m.funnel.map((f) => `<div class="fun"><span>${f.k}</span><div class="bar" style="width:${Math.max(4, f.v / max * 100)}%">${f.v}</div></div>`).join('')}</div>
  <div><div class="card"><h2>MVP gates</h2>${m.gates.map((g) => `<div class="row"><span class="pill ${g.ok ? 'p-g' : 'p-r'}">${g.ok ? 'MET' : 'NOT MET'}</span><span>${g.k} <b>(${g.v})</b></span></div>`).join('')}</div>
  <div class="card"><div class="grid g2"><div class="kpi">${money(m.feesAccrued)}<small>fees accrued</small></div><div class="kpi">${m.active7d}<small>learners active 7d</small></div></div></div></div></div>
  <div class="grid g2"><div class="card"><h2>Tutor</h2><div class="small">${m.tutor.total} questions · ${m.tutor.refusedPct ?? 0}% refused as off-curriculum<br>${m.tutor.byMode.map((r) => `${r.mode}${r.grounded ? '' : ' (ungrounded)'}: ${r.n}`).join(' · ') || 'none yet'}</div>
  <h2 style="margin-top:14px">Task pass rates</h2><div class="scroll"><table><tr><th>Task</th><th>Attempts</th><th>Pass</th></tr>${m.tasks.map((t) => `<tr><td>${t.id}</td><td>${t.attempts}</td><td>${t.passPct}%</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No attempts.</td></tr>'}</table></div></div>
  <div class="card"><h2><span class="live"></span>Live activity</h2><div id="feed" class="small" style="height:300px;overflow:auto"></div></div></div>`;
}

// ---------- public verify ----------
async function verifyView(id) {
  view = null;
  app.innerHTML = '<div class="card verifybox"><p class="muted">Checking…</p></div>';
  const r = await api('GET', '/api/verify/' + encodeURIComponent(id)).catch((e) => ({ found: false, valid: false, reason: e.message }));
  const p = r.payload;
  app.innerHTML = `<div class="card verifybox"><h1>Credential check</h1><p class="muted">ID <code>${esc(id)}</code></p>
  <div class="verdict ${r.valid ? 'ok' : 'no'}">${r.valid ? '✓ VALID' : '✗ INVALID'}</div><p>${esc(r.reason || '')}</p>
  ${p ? `<div style="text-align:left"><table><tr><th>Holder</th><td>${esc(p.holder.name)}</td></tr><tr><th>Credential</th><td>${esc(p.skill || p.role)} (${esc(p.type)})</td></tr><tr><th>Issued</th><td>${esc(p.issuedAt)}</td></tr><tr><th>Issuer key</th><td>${esc(r.issuerKey)} · ${r.algorithm}</td></tr><tr><th>Hash</th><td><code>${esc(r.hash.slice(0, 32))}…</code></td></tr></table>
  <p class="small muted" style="margin-top:12px">What this proves: eduSync issued this exact record and it has not been edited. What it does not prove: who typed the answers. Employers should still run an interview.</p>
  <button class="ghost" id="tamper">Try tampering: change the holder's name and re-verify</button><div id="tres"></div></div>` : ''}
  <p class="small muted" style="margin-top:14px">Public key: <a href="#" id="jwks">show public key (JWKS)</a></p><pre class="code" id="jwk" hidden></pre></div>`;
  const t = $('#tamper'); if (t) t.onclick = async () => {
    const forged = { ...p, holder: { ...p.holder, name: p.holder.name + ' (edited)' } };
    const v = await api('POST', '/api/verify', { payload: forged, sig: r.sig });
    $('#tres').innerHTML = `<div class="verdict ${v.valid ? 'ok' : 'no'}">${v.valid ? '✓ VALID' : '✗ INVALID — edit detected'}</div>`;
  };
}

// ---------- router ----------
async function route() {
  shell();
  const h = location.hash.replace(/^#\/?/, ''); const [a, b] = h.split('/');
  try {
    if (a === 'verify') return verifyView(b);
    if (ME.role === 'learner') {
      if (a === 'skill') return skillView(b); if (a === 'jobs') return jobsView(); if (a === 'apps') return appsView(); if (a === 'creds') return credsView(); return dashView();
    }
    if (ME.role === 'employer') return a === 'e' && b === 'pipe' ? ePipeView() : eJobsView();
    return adminView();
  } catch (e) { app.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; }
}
async function boot() {
  CFG = await api('GET', '/api/config').catch(() => ({}));
  const m = location.hash.match(/^#\/verify\/(ES-[A-Fa-f0-9]+)/);
  ME = (await api('GET', '/api/me').catch(() => ({}))).user || null;
  if (m) { shell(); return verifyView(m[1]); }
  if (!ME) { shell(); return authView(); }
  connect(); route();
}
addEventListener('hashchange', () => {
  const m = location.hash.match(/^#\/verify\/(ES-[A-Fa-f0-9]+)/);
  if (ME) route(); else if (m) { shell(); verifyView(m[1]); } else boot();
});
document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-csv]');
  if (c) {
    e.preventDefault();
    const r = await fetch('/api/data/' + c.dataset.csv + '.csv'); const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = c.dataset.csv + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (e.target.id === 'jwks') {
    e.preventDefault(); const j = await (await fetch('/.well-known/jwks.json')).json(); const pre = document.getElementById('jwk');
    pre.textContent = JSON.stringify(j, null, 2); pre.hidden = !pre.hidden;
  }
  if (e.target.id === 'reset-demo' && confirm('Erase all demo data stored in this browser (users, progress, credentials, signing key)?')) window.__edusync.reset();
});
boot();
