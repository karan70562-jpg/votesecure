/**
 * VoteSecure — Frontend
 * Talks to Vercel serverless API backed by MongoDB Atlas
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// When deployed on Vercel, API is on the same origin — no URL needed.
// For local dev with `vercel dev`, this also works as-is.
const API = '';

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = null;
let token = null;
let polls = [];
let viewPollId = null;
let selectedOpt = null;

// ─── INIT ────────────────────────────────────────────────────────────────────
(function init() {
  const saved = localStorage.getItem('vs_session');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      token = s.token;
      currentUser = s.user;
      currentUser.role === 'admin' ? enterAdmin() : enterVoter();
      return;
    } catch {}
  }
  showScreen('auth');
})();

// ─── API HELPERS ─────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body)  opts.body = JSON.stringify(body);

  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── SCREEN ROUTING ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('#auth-tabs .tab').forEach((el, i) =>
    el.classList.toggle('active', i === (tab === 'login' ? 0 : 1))
  );
  document.getElementById('login-form').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

async function doLogin() {
  const email    = document.getElementById('li-email').value.trim();
  const password = document.getElementById('li-pass').value;
  clearMsg('li-err');
  setLoading('btn-login', true);

  try {
    const data = await api('/api/auth?action=login', 'POST', { email, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('vs_session', JSON.stringify({ token, user: currentUser }));
    currentUser.role === 'admin' ? enterAdmin() : enterVoter();
  } catch (e) {
    setMsg('li-err', e.message);
  } finally {
    setLoading('btn-login', false);
  }
}

async function doRegister() {
  const name     = document.getElementById('rg-name').value.trim();
  const email    = document.getElementById('rg-email').value.trim();
  const password = document.getElementById('rg-pass').value;
  clearMsg('rg-err'); clearMsg('rg-ok');
  setLoading('btn-register', true);

  try {
    await api('/api/auth?action=register', 'POST', { name, email, password });
    setMsg('rg-ok', '✓ Account created! You can now sign in.');
    setTimeout(() => { clearMsg('rg-ok'); switchAuthTab('login'); document.getElementById('li-email').value = email; }, 1500);
  } catch (e) {
    setMsg('rg-err', e.message);
  } finally {
    setLoading('btn-register', false);
  }
}

function logout() {
  token = null; currentUser = null; polls = []; viewPollId = null;
  localStorage.removeItem('vs_session');
  document.getElementById('voter-poll-view').style.display = 'none';
  document.getElementById('voter-list-view').style.display = 'block';
  showScreen('auth');
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────
async function enterAdmin() {
  showScreen('admin');
  switchAdminTab('polls');
  await loadAdminPolls();
}

function switchAdminTab(tab) {
  document.querySelectorAll('#admin-tabs .tab').forEach((el, i) =>
    el.classList.toggle('active', i === (tab === 'polls' ? 0 : 1))
  );
  document.getElementById('admin-polls').style.display  = tab === 'polls'  ? 'block' : 'none';
  document.getElementById('admin-create').style.display = tab === 'create' ? 'block' : 'none';
}

async function loadAdminPolls() {
  const el = document.getElementById('admin-poll-list');
  el.innerHTML = '<div class="loading">Loading polls...</div>';
  try {
    polls = await api('/api/polls');
    renderAdminPolls();
  } catch (e) {
    el.innerHTML = `<div class="err">${e.message}</div>`;
  }
}

function renderAdminPolls() {
  const el = document.getElementById('admin-poll-list');
  if (!polls.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><p>No polls yet. Create your first poll!</p></div>';
    return;
  }
  el.innerHTML = polls.map(poll => {
    const shortId = poll.id.slice(-8).toUpperCase();
    const optRows = poll.options.map((opt, i) => {
      const count = poll.voteCounts?.[i] || 0;
      const pct   = poll.totalVotes ? Math.round(count / poll.totalVotes * 100) : 0;
      return `<div class="progress-wrap">
        <div class="progress-row">
          <span>${escHtml(opt)}</span>
          <span class="progress-pct">${count} vote${count !== 1 ? 's' : ''} · ${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    return `<div class="poll-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:.25rem">
        <div class="poll-title">${escHtml(poll.question)}</div>
        <span class="tag ${poll.open ? 'tag-open' : 'tag-closed'}">${poll.open ? 'Open' : 'Closed'}</span>
      </div>
      <div class="poll-meta">${poll.totalVotes} vote${poll.totalVotes !== 1 ? 's' : ''} · ${timeAgo(poll.createdAt)}</div>
      ${optRows}
      <div class="poll-actions">
        <button class="btn sm" onclick="togglePoll('${poll.id}', ${!poll.open})">${poll.open ? 'Close poll' : 'Reopen poll'}</button>
        <button class="btn sm" onclick="showPollLink('${poll.id}', '${shortId}')">Share link</button>
        <button class="btn sm danger" onclick="deletePoll('${poll.id}')">Delete</button>
      </div>
      <div id="link-${poll.id}" class="link-box" style="display:none">
        <div>Share this Poll ID with voters: <span class="link-id">${shortId}</span></div>
        <button class="btn sm" onclick="copyToClipboard('${shortId}', this)">Copy</button>
      </div>
    </div>`;
  }).join('');
}

function addOpt() {
  const list = document.getElementById('options-list');
  const row  = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `<input class="opt-inp" placeholder="Option..."/>
    <button class="btn sm icon-btn" onclick="removeOpt(this)">✕</button>`;
  list.appendChild(row);
}

function removeOpt(btn) {
  if (document.querySelectorAll('.option-row').length <= 2) return;
  btn.parentElement.remove();
}

async function createPoll() {
  const question = document.getElementById('new-q').value.trim();
  const options  = [...document.querySelectorAll('.opt-inp')].map(i => i.value.trim()).filter(Boolean);
  clearMsg('create-err'); clearMsg('create-ok');

  if (!question)         { setMsg('create-err', 'Poll question is required'); return; }
  if (options.length < 2){ setMsg('create-err', 'At least 2 options are required'); return; }

  setLoading('btn-create', true);
  try {
    await api('/api/polls', 'POST', { question, options });
    setMsg('create-ok', '✓ Poll created!');
    document.getElementById('new-q').value = '';
    document.querySelectorAll('.opt-inp').forEach((el, i) => { el.value = ''; if (i >= 2) el.parentElement.remove(); });
    setTimeout(async () => { clearMsg('create-ok'); switchAdminTab('polls'); await loadAdminPolls(); }, 1200);
  } catch (e) {
    setMsg('create-err', e.message);
  } finally {
    setLoading('btn-create', false);
  }
}

async function togglePoll(id, open) {
  try {
    await api('/api/polls', 'PUT', { id, open });
    await loadAdminPolls();
  } catch (e) { alert(e.message); }
}

async function deletePoll(id) {
  if (!confirm('Delete this poll and all its votes? This cannot be undone.')) return;
  try {
    await api('/api/polls?id=' + id, 'DELETE');
    await loadAdminPolls();
  } catch (e) { alert(e.message); }
}

function showPollLink(id, shortId) {
  const box = document.getElementById('link-' + id);
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'flex' : 'none';
}

// ─── VOTER ────────────────────────────────────────────────────────────────────
async function enterVoter() {
  const u = currentUser;
  document.getElementById('voter-avatar').textContent   = (u.name[0] || 'U').toUpperCase();
  document.getElementById('voter-name-lbl').textContent = u.name;
  showScreen('voter');
  await loadVoterPolls();
}

async function loadVoterPolls() {
  const el = document.getElementById('voter-polls-list');
  el.innerHTML = '<div class="loading">Loading polls...</div>';
  try {
    polls = await api('/api/polls');
    renderVoterPolls();
  } catch (e) {
    el.innerHTML = `<div class="err">${e.message}</div>`;
  }
}

function renderVoterPolls() {
  const el = document.getElementById('voter-polls-list');
  let html = '';

  if (!polls.length) {
    html = '<div class="empty"><div class="empty-icon">🗳️</div><p>No active polls right now. Check back later!</p></div>';
  } else {
    html = polls.map(poll => {
      const voted = poll.myVote !== null && poll.myVote !== undefined;
      return `<div class="poll-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:.25rem">
          <div class="poll-title">${escHtml(poll.question)}</div>
          ${voted ? '<span class="tag tag-voted">Voted</span>' : ''}
        </div>
        <div class="poll-meta">${poll.totalVotes} vote${poll.totalVotes !== 1 ? 's' : ''} · ${poll.options.length} options</div>
        <button class="btn sm primary" onclick="openVoteView('${poll.id}')">${voted ? 'See results' : 'Vote now'}</button>
      </div>`;
    }).join('');
  }

  html += `<div class="card find-poll-card">
    <div class="card-header"><span class="card-title">Vote by Poll ID</span></div>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:.875rem">Got a Poll ID from an admin? Enter it here.</p>
    <div class="find-row">
      <input id="poll-id-inp" placeholder="e.g. A1B2C3D4" style="font-family:monospace;text-transform:uppercase"/>
      <button class="btn primary" onclick="findPoll()">Find</button>
    </div>
    <div id="poll-id-err" class="err" style="display:none"></div>
  </div>`;

  el.innerHTML = html;
}

async function findPoll() {
  const raw = document.getElementById('poll-id-inp').value.trim().toUpperCase();
  clearMsg('poll-id-err');
  try {
    const all = await api('/api/polls');
    const poll = all.find(p => p.id.slice(-8).toUpperCase() === raw || p.id === raw);
    if (!poll) { setMsg('poll-id-err', 'Poll not found. Check the ID and try again.'); return; }
    polls = all;
    openVoteView(poll.id);
  } catch (e) {
    setMsg('poll-id-err', e.message);
  }
}

function openVoteView(pollId) {
  selectedOpt = null;
  viewPollId = pollId;
  document.getElementById('voter-list-view').style.display = 'none';
  const vv = document.getElementById('voter-poll-view');
  vv.style.display = 'block';
  renderVoteView(pollId);
}

function renderVoteView(pollId) {
  const poll = polls.find(p => p.id === pollId);
  if (!poll) { backToList(); return; }

  const voted      = poll.myVote !== null && poll.myVote !== undefined;
  const letters    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let optHtml      = '';

  if (!voted && poll.open) {
    optHtml = poll.options.map((opt, i) =>
      `<div class="vote-option" id="vopt-${i}" onclick="selectOpt(${i})">
        <div class="option-letter">${letters[i]}</div>
        <span>${escHtml(opt)}</span>
      </div>`
    ).join('');
    optHtml += `<div id="vote-err" class="err" style="display:none;margin-top:.5rem"></div>
      <button class="btn primary" onclick="submitVote('${pollId}')" style="margin-top:.875rem">Submit my vote</button>`;
  } else {
    if (voted) optHtml += `<div class="voted-notice">✓ Your vote has been recorded</div>`;
    else if (!poll.open) optHtml += `<div style="color:var(--text-hint);font-size:14px;margin-bottom:.875rem">This poll is now closed.</div>`;

    optHtml += `<div class="total-votes">${poll.totalVotes} total vote${poll.totalVotes !== 1 ? 's' : ''}</div>`;
    optHtml += poll.options.map((opt, i) => {
      const count    = poll.voteCounts?.[i] || 0;
      const pct      = poll.totalVotes ? Math.round(count / poll.totalVotes * 100) : 0;
      const isMyVote = poll.myVote === i;
      return `<div style="margin-bottom:.875rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">
          <div class="option-letter ${isMyVote ? 'my-vote' : ''}">${letters[i]}</div>
          <span style="flex:1;font-size:14px">${escHtml(opt)}</span>
          ${isMyVote ? '<span class="tag tag-voted" style="font-size:10px">Your vote</span>' : ''}
          <span style="font-size:13px;color:var(--text-muted);min-width:55px;text-align:right">${count} · ${pct}%</span>
        </div>
        <div class="progress-bar" style="margin-left:40px">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('voter-poll-view').innerHTML = `
    <button class="btn sm back-btn" onclick="backToList()">← All polls</button>
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${escHtml(poll.question)}</div>
          <div style="font-size:12px;color:var(--text-hint);margin-top:2px">Poll ID: ${poll.id.slice(-8).toUpperCase()}</div>
        </div>
        <span class="tag ${poll.open ? 'tag-open' : 'tag-closed'}">${poll.open ? 'Open' : 'Closed'}</span>
      </div>
      ${optHtml}
    </div>`;
}

function selectOpt(i) {
  document.querySelectorAll('.vote-option').forEach((el, idx) => el.classList.toggle('selected', idx === i));
  selectedOpt = i;
}

async function submitVote(pollId) {
  if (selectedOpt === null) { setMsg('vote-err', 'Please select an option before submitting'); return; }
  setLoading('vote-err', false);
  try {
    await api('/api/votes', 'POST', { pollId, optionIndex: selectedOpt });
    // refresh poll data
    polls = await api('/api/polls');
    renderVoteView(pollId);
    renderVoterPolls();
  } catch (e) {
    setMsg('vote-err', e.message);
  }
}

async function backToList() {
  document.getElementById('voter-poll-view').style.display = 'none';
  document.getElementById('voter-list-view').style.display = 'block';
  viewPollId = null;
  await loadVoterPolls();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function setMsg(id, msg)   { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.display = 'block'; } }
function clearMsg(id)      { const el = document.getElementById(id); if (el) { el.textContent = ''; el.style.display = 'none'; } }
function setLoading(id, on){ const el = document.getElementById(id); if (el) el.disabled = on; }
function escHtml(s)        { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent; btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => alert('Poll ID: ' + text));
}
function timeAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}
