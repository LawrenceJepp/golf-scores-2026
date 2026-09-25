(function () {
  'use strict';
  const GW = window.GW;
  const { PLAYERS, COURSES } = GW;
  const API = '/api/state';
  const POLL_MS = 3000;
  const LS = { state: 'gw_state_v1', pending: 'gw_pending_v1', group: 'gw_group_v1' };
  const TEAM_KEYS = ['A', 'B', 'C', 'D', 'E'];

  // ---------- storage + sync ----------
  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  let server = lsGet(LS.state, null);
  if (!server || !server.scores) server = GW.emptyState();
  let pending = lsGet(LS.pending, []);
  let online = null, lastError = null, flushing = false, writeSeq = 0;

  const ui = {
    hcpDraft: {}, hcpEditing: false, editDraft: {},
    group: lsGet(LS.group, { day1: 0, day2: 0 }),
    entry: null, toast: null,
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function applyOp(st, op) {
    switch (op.op) {
      case 'setHandicap':
        if (op.value == null) delete st.handicaps[op.player]; else st.handicaps[op.player] = op.value;
        break;
      case 'setScores':
        op.entries.forEach((e) => { st.scores[op.day][e.player][e.hole - 1] = e.strokes; });
        break;
      case 'setComplete':
        st.complete[op.day][op.group - 1] = op.done;
        break;
      case 'lockTeams':
        if (!st.teams) st.teams = op.teams;
        break;
      case 'reset':
        return GW.emptyState();
    }
    return st;
  }

  // What the user sees: last server state with not-yet-synced local changes on top.
  function view() {
    let st = clone(server);
    for (const op of pending) st = applyOp(st, op);
    return st;
  }

  function send(op) {
    pending.push(op);
    writeSeq++;
    lsSet(LS.pending, pending);
    render();
    flush();
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      while (pending.length) {
        const op = pending[0];
        let r;
        try {
          r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
        } catch { online = false; break; }
        if (r.status >= 400 && r.status < 500) {
          const j = await r.json().catch(() => ({}));
          pending.shift(); lsSet(LS.pending, pending);
          toast('Not saved: ' + (j.error || r.status));
          continue;
        }
        if (!r.ok) { online = false; lastError = (await r.json().catch(() => ({}))).error; break; }
        server = await r.json();
        online = true; lastError = null; writeSeq++;
        lsSet(LS.state, server);
        pending.shift(); lsSet(LS.pending, pending);
      }
    } finally {
      flushing = false;
      render();
    }
  }

  async function refresh() {
    if (pending.length) return flush();
    if (flushing) return;
    const seq = writeSeq;
    try {
      // Send the version we already have; the server replies "unchanged" (a tiny response) unless something new was saved.
      const url = server.ver != null ? API + '?v=' + encodeURIComponent(server.ver) : API;
      const r = await fetch(url, { cache: 'no-store' });
      if (seq !== writeSeq || flushing) return; // a write landed meanwhile; this read may be stale
      if (!r.ok) { online = false; lastError = (await r.json().catch(() => ({}))).error; }
      else {
        const j = await r.json();
        online = true; lastError = null;
        if (!j.unchanged) { server = j; lsSet(LS.state, server); }
      }
    } catch { online = false; }
    render({ poll: true });
  }

  // Only poll while the app is on screen (saves battery and database usage when phones are in pockets).
  setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', refresh);

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const sum = (arr) => arr.reduce((s, v) => s + (v || 0), 0);
  const played = (arr) => arr.filter((v) => v != null).length;

  function chFor(st, day, p) { const hi = st.handicaps[p]; return hi == null ? null : GW.courseHandicap(day, hi); }
  function fmtPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n); }
  function fmtHI(hi) { return hi == null ? '–' : hi < 0 ? '+' + Math.abs(hi).toFixed(1) : hi.toFixed(1); }
  function fmtCH(c) { return c == null ? '–' : c < 0 ? '+' + Math.abs(c) : String(c); }
  function draftHI(hi) { return hi == null ? '' : hi < 0 ? '+' + Math.abs(hi) : String(hi); }

  function parseHI(s) {
    s = String(s == null ? '' : s).trim().replace(',', '.');
    if (!s) return undefined;
    let plus = false;
    if (s[0] === '+') { plus = true; s = s.slice(1); }
    if (!/^\d{1,2}(\.\d+)?$/.test(s)) return NaN;
    let v = Math.round(parseFloat(s) * 10) / 10;
    if (v > 54 || (plus && v > 10)) return NaN;
    if (plus) v = -v;
    return v;
  }

  // ---------- Day 1 ----------
  function day1Rows(st) {
    const c = COURSES.day1;
    const rows = PLAYERS.map((p) => {
      const sc = st.scores.day1[p];
      const ch = chFor(st, 'day1', p);
      let thru = 0, gross = 0, par = 0, shots = 0;
      sc.forEach((v, i) => {
        if (v == null) return;
        thru++; gross += v; par += c.par[i]; shots += GW.shotsReceived(ch, c.si[i]);
      });
      return { p, sc, ch, thru, gross, toPar: gross - par, nettToPar: gross - par - shots, nett: thru === 18 && ch != null ? gross - ch : null };
    });
    return rows.sort((a, b) => cmpDay1(a, b) || a.p.localeCompare(b.p));
  }

  // Countback on nett: back 9 (½ h'cap), last 6 (⅓), last 3 (⅙), last hole (1/18)
  function countback(r) {
    const h = r.ch || 0;
    const seg = (from, frac) => sum(r.sc.slice(from)) - h * frac;
    return [seg(9, 1 / 2), seg(12, 1 / 3), seg(15, 1 / 6), seg(17, 1 / 18)];
  }

  function cmpDay1(a, b) {
    if (!a.thru || !b.thru) return (b.thru ? 1 : 0) - (a.thru ? 1 : 0);
    if (a.nettToPar !== b.nettToPar) return a.nettToPar - b.nettToPar;
    if (a.thru === 18 && b.thru === 18) {
      const ca = countback(a), cb = countback(b);
      for (let i = 0; i < 4; i++) if (Math.abs(ca[i] - cb[i]) > 1e-9) return ca[i] - cb[i];
      return 0;
    }
    return b.thru - a.thru;
  }

  function dayComplete(st, day) {
    return st.complete[day].every(Boolean);
  }

  function computeTeams(st) {
    const r = day1Rows(st).map((x) => x.p);
    return { A: [r[0], r[9]], B: [r[1], r[8]], C: [r[2], r[7]], D: [r[3], r[6]], E: [r[4], r[5]] };
  }

  function teamsFor(st) {
    return st.teams || (dayComplete(st, 'day1') ? computeTeams(st) : null);
  }

  function groupsFor(st, day) {
    if (day === 'day1') return GW.DAY1_GROUPS;
    const t = teamsFor(st);
    return t ? GW.DAY2_SLOTS.map((g) => g.map((s) => t[s[0]][Number(s[1]) - 1])) : null;
  }

  function partnerOf(t, p) {
    for (const k of TEAM_KEYS) { const [a, b] = t[k]; if (a === p) return b; if (b === p) return a; }
    return null;
  }

  // ---------- Day 2 ----------
  function pointsFor(st, p) {
    const c = COURSES.day2, ch = chFor(st, 'day2', p);
    return st.scores.day2[p].map((v, i) => GW.stablefordPoints(v, c.par[i], GW.shotsReceived(ch, c.si[i])));
  }

  function day2Rows(st, t) {
    return TEAM_KEYS.map((k) => {
      const [a, b] = t[k];
      const pa = pointsFor(st, a), pb = pointsFor(st, b);
      let bonus = 0;
      for (let i = 0; i < 18; i++) {
        if (pa[i] == null || pb[i] == null) continue;
        if (pa[i] >= 2 && pb[i] >= 2) bonus++;
        else if (pa[i] === 0 && pb[i] === 0) bonus--;
      }
      const players = [{ p: a, thru: played(pa), score: sum(pa) }, { p: b, thru: played(pb), score: sum(pb) }];
      return { k, players, bonus, total: players[0].score + players[1].score + bonus };
    }).sort((x, y) => y.total - x.total || x.k.localeCompare(y.k));
  }

  function currentHole(st, day, players) {
    for (let i = 0; i < 18; i++) if (players.some((p) => st.scores[day][p][i] == null)) return i + 1;
    return 19;
  }
  function firstMissing(st, day, players, hole) {
    const i = players.findIndex((p) => st.scores[day][p][hole - 1] == null);
    return i < 0 ? 0 : i;
  }

  // ---------- views ----------
  function header(title, sub, right) {
    return `<header class="top">
      <button class="hbtn" data-go="">⌂ Home</button>
      <div class="ttl"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
      <div class="hright">${right || ''}</div>
    </header>`;
  }

  function vHome(st) {
    const n = PLAYERS.filter((p) => st.handicaps[p] != null).length;
    const status = (day) => {
      const done = st.complete[day].filter(Boolean).length;
      const any = PLAYERS.some((p) => played(st.scores[day][p]) > 0);
      if (done === 3) return 'Complete';
      if (any || done) return `In progress · ${done}/3 groups finished`;
      return 'Not started';
    };
    let leader1 = '';
    const r1 = day1Rows(st);
    if (r1[0] && r1[0].thru) leader1 = `Leader: ${esc(r1[0].p)} ${fmtPar(r1[0].nettToPar)}`;
    let leader2 = '';
    const t = teamsFor(st);
    if (t) { const r2 = day2Rows(st, t); if (r2.some((r) => r.players.some((x) => x.thru))) leader2 = `Leader: ${esc(r2[0].players[0].p)} + ${esc(r2[0].players[1].p)} (${r2[0].total} pts)`; }
    return `<div class="home">
      <div class="hero">
        <div class="flag">⛳</div>
        <h1>Golf Weekend</h1>
        <p>The Warwickshire · Yellow tees</p>
      </div>
      <button class="tile t-day1" data-go="day1">
        <span class="tag">Day 1</span><h2>Kings Course</h2><p>Individual nett stroke play</p>
        <span class="meta">${status('day1')}${leader1 ? ' · ' + leader1 : ''}</span>
      </button>
      <button class="tile t-day2" data-go="day2">
        <span class="tag">Day 2</span><h2>Earls Course</h2><p>Stableford pairs + bonus points</p>
        <span class="meta">${status('day2')}${leader2 ? ' · ' + leader2 : ''}</span>
      </button>
      <button class="tile t-hcp ${n < 10 ? 'start' : ''}" data-go="handicaps">
        ${n < 10 ? '<span class="tag">Start here</span>' : ''}<h2>Handicaps</h2>
        <p>${n}/10 submitted</p>
      </button>
    </div>`;
  }

  function vHandicaps(st) {
    const n = PLAYERS.filter((p) => st.handicaps[p] != null).length;
    const all = n === PLAYERS.length;

    if (all && !ui.hcpEditing) {
      return header('Handicaps', 'Course handicaps · Yellow tees', `<button class="hbtn" data-act="hcp-edit">Edit Handicaps</button>`) +
        `<main><table class="lb hcp">
          <thead><tr><th class="l">Player</th><th>H'cap<br>Index</th><th>Kings<br>Course H'cap</th><th>Earls<br>Course H'cap</th></tr></thead>
          <tbody>${PLAYERS.map((p) => `<tr><td class="l name">${esc(p)}</td><td>${fmtHI(st.handicaps[p])}</td>
            <td class="big">${fmtCH(chFor(st, 'day1', p))}</td><td class="big">${fmtCH(chFor(st, 'day2', p))}</td></tr>`).join('')}</tbody>
        </table>
        <p class="note">Course handicaps from the club's Course Handicap tables — Kings (CR 72.0 / Slope 132) and Earls (CR 72.3 / Slope 127), men's yellow tees.</p>
        ${resetBlock()}</main>`;
    }

    if (ui.hcpEditing) {
      return header('Edit Handicaps', '', `<button class="hbtn" data-act="hcp-cancel">Cancel</button>`) +
        `<main><div class="list">${PLAYERS.map((p) => {
          const v = ui.editDraft[p] ?? draftHI(st.handicaps[p]);
          const parsed = parseHI(v);
          const ok = parsed !== undefined && !isNaN(parsed);
          return `<div class="row"><span class="name">${esc(p)}</span>
            <input class="hin" data-edit="${esc(p)}" value="${esc(v)}" inputmode="decimal" autocomplete="off" placeholder="e.g. 14.2">
            <span class="chs">${ok ? `K ${fmtCH(GW.courseHandicap('day1', parsed))} · E ${fmtCH(GW.courseHandicap('day2', parsed))}` : ''}</span></div>`;
        }).join('')}</div>
        <button class="btn primary block" data-act="hcp-save">Save</button></main>`;
    }

    return header('Handicaps', `${n} of ${PLAYERS.length} submitted`) +
      `<main><p class="note">Enter each player's Handicap Index and press Submit. Once all ${PLAYERS.length} are in you'll see everyone's course handicaps.</p>
      <div class="list">${PLAYERS.map((p) => {
        const saved = st.handicaps[p];
        const v = ui.hcpDraft[p] ?? draftHI(saved);
        return `<div class="row ${saved != null ? 'done' : ''}"><span class="name">${esc(p)}</span>
          <input class="hin" data-hcp="${esc(p)}" value="${esc(v)}" inputmode="decimal" autocomplete="off" placeholder="Index">
          ${hcpButton(p, v, saved)}</div>`;
      }).join('')}</div>${resetBlock()}</main>`;
  }

  function hcpButton(p, v, saved) {
    const parsed = parseHI(v);
    const same = saved != null && parsed === saved;
    return `<button class="btn ${same ? 'ok' : 'primary'}" data-act="hcp-submit" data-p="${esc(p)}" ${same ? 'disabled' : ''}>${same ? '✓ Saved' : saved != null ? 'Update' : 'Submit'}</button>`;
  }

  function resetBlock() {
    return `<details class="danger"><summary>Admin</summary>
      <p>Wipes every handicap and score for the whole group. Only use this after testing, before the weekend.</p>
      <button class="btn warn" data-act="reset">Reset all data…</button></details>`;
  }

  function tabs(day, tab) {
    return `<nav class="tabs">
      <button class="${tab === 'lb' ? 'on' : ''}" data-go="${day}">Leaderboard</button>
      <button class="${tab === 'card' ? 'on' : ''}" data-go="${day}/card">Scorecard</button>
    </nav>`;
  }

  function vDay(st, day, tab) {
    const c = COURSES[day];
    const body = tab === 'card' ? vCard(st, day) : day === 'day1' ? vLb1(st) : vLb2(st);
    return header(`${c.day} · ${c.name}`, c.format) + tabs(day, tab) + `<main>${body}</main>`;
  }

  function vLb1(st) {
    const rows = day1Rows(st);
    const trs = rows.map((r, i) => {
      let pos = '';
      if (r.thru) {
        let j = i;
        while (j > 0 && rows[j - 1].thru && cmpDay1(rows[j - 1], r) === 0) j--;
        const tied = j < i || (rows[i + 1] && rows[i + 1].thru && cmpDay1(rows[i + 1], r) === 0);
        pos = (tied ? 'T' : '') + (j + 1);
      }
      const nett = r.thru ? fmtPar(r.nettToPar) : '–';
      return `<tr class="${r.thru ? '' : 'dim'}">
        <td class="pos">${pos}</td>
        <td class="l name">${esc(r.p)}<small>H'cap ${fmtCH(r.ch)}</small></td>
        <td>${r.thru || '–'}</td>
        <td>${r.thru ? r.gross + `<small>${fmtPar(r.toPar)}</small>` : '–'}</td>
        <td class="big ${r.nettToPar < 0 && r.thru ? 'under' : ''}">${nett}${r.nett != null ? `<small>${r.nett} nett</small>` : ''}</td>
      </tr>`;
    }).join('');
    return live() + `<table class="lb">
      <thead><tr><th></th><th class="l">Player</th><th>Thru</th><th>Total</th><th>Nett</th></tr></thead>
      <tbody>${trs}</tbody></table>
      <p class="note">Nett is shown against par, using the strokes each player receives (Kings course handicap, by stroke index) on the holes played so far. After 18 holes: Nett = Total − course handicap. Ties after 18 are split on countback (back 9, 6, 3, 1).</p>`;
  }

  function vLb2(st) {
    const t = teamsFor(st);
    if (!t) {
      const done = st.complete.day1.map((d, i) => d ? null : `Group ${i + 1}`).filter(Boolean);
      const anyD1 = PLAYERS.some((p) => played(st.scores.day1[p]) > 0);
      let proj = '';
      if (anyD1) {
        const pt = computeTeams(st);
        proj = `<h3 class="sub">Projected teams (live from Day 1)</h3><div class="teams">${TEAM_KEYS.map((k) =>
          `<div class="team"><span>${esc(pt[k][0])} + ${esc(pt[k][1])}</span></div>`).join('')}</div>`;
      }
      return `<div class="empty"><h2>Teams not set yet</h2>
        <p>Day 2 teams are drawn from the final Day 1 leaderboard (1st + 10th, 2nd + 9th … 5th + 6th) once all three Day 1 groups have pressed <b>Complete Round</b>.</p>
        <p class="muted">Still to finish: ${done.join(', ')}</p></div>${proj}`;
    }
    const rows = day2Rows(st, t);
    const trs = rows.map((r, i) => {
      const [a, b] = r.players;
      const first = rows.findIndex((x) => x.total === r.total);
      const tied = rows.filter((x) => x.total === r.total).length > 1;
      const pos = (tied ? 'T' : '') + (first + 1);
      return `<tr>
        <td class="pos">${pos}</td>
        <td class="l name team">${esc(a.p)} + ${esc(b.p)}</td>
        <td class="p1">${a.thru || '–'}</td><td class="p1 b">${a.score}</td>
        <td class="p2">${b.thru || '–'}</td><td class="p2 b">${b.score}</td>
        <td class="${r.bonus > 0 ? 'under' : r.bonus < 0 ? 'over' : ''}">${r.bonus > 0 ? '+' + r.bonus : r.bonus < 0 ? '−' + Math.abs(r.bonus) : '0'}</td>
        <td class="big">${r.total}</td>
      </tr>`;
    }).join('');
    return live() + `<table class="lb lb2">
      <thead>
        <tr><th rowspan="2"></th><th rowspan="2" class="l">Team</th><th colspan="2" class="p1">Player 1</th><th colspan="2" class="p2">Player 2</th><th rowspan="2">Bonus</th><th rowspan="2">Total<br>Score</th></tr>
        <tr><th class="p1">Thru</th><th class="p1">Score</th><th class="p2">Thru</th><th class="p2">Score</th></tr>
      </thead>
      <tbody>${trs}</tbody></table>
      <p class="note">Stableford off Earls course handicaps. Bonus per hole: <b>+1</b> if both partners score 2+ points, <b>−1</b> if both score 0. Total = both players' points + bonus.</p>`;
  }

  function scoreClass(v, par) {
    if (v == null) return '';
    const d = v - par;
    return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'dbl' : '';
  }

  function cardHalf(st, day, players, back, cur) {
    const c = COURSES[day];
    const idx = back ? range(9, 18) : range(0, 9);
    const lab = back ? 'In' : 'Out';
    const t = day === 'day2' ? teamsFor(st) : null;
    const colCls = (i) => (i + 1 === cur ? ' cur' : '');
    let html = `<table class="card"><tbody>
      <tr class="r-hole"><th>Hole</th>${idx.map((i) => `<td class="${colCls(i)}">${i + 1}</td>`).join('')}<td class="tot">${lab}</td></tr>
      <tr class="r-yds"><th>Yellow</th>${idx.map((i) => `<td>${c.yards[i]}</td>`).join('')}<td class="tot">${sum(idx.map((i) => c.yards[i]))}</td></tr>
      <tr class="r-par"><th>Par</th>${idx.map((i) => `<td>${c.par[i]}</td>`).join('')}<td class="tot">${sum(idx.map((i) => c.par[i]))}</td></tr>
      <tr class="r-si"><th>S.I.</th>${idx.map((i) => `<td>${c.si[i]}</td>`).join('')}<td class="tot"></td></tr>`;
    for (const p of players) {
      const ch = chFor(st, day, p);
      const sc = st.scores[day][p];
      const pts = day === 'day2' ? pointsFor(st, p) : null;
      html += `<tr class="r-pl"><th>${esc(p)}${t ? `<small>+ ${esc(partnerOf(t, p) || '')}</small>` : ''}</th>${idx.map((i) => {
        const shots = GW.shotsReceived(ch, c.si[i]);
        const dots = shots > 0 ? `<i class="dots">${'•'.repeat(shots)}</i>` : '';
        return `<td class="${colCls(i)}">${dots}${sc[i] != null ? `<span class="sc ${scoreClass(sc[i], c.par[i])}">${sc[i]}</span>` : ''}</td>`;
      }).join('')}<td class="tot">${played(idx.map((i) => sc[i])) ? sum(idx.map((i) => sc[i])) : ''}</td></tr>`;
      if (pts) {
        html += `<tr class="r-pts"><th>Points</th>${idx.map((i) => `<td class="${colCls(i)}">${pts[i] ?? ''}</td>`).join('')}<td class="tot">${played(idx.map((i) => pts[i])) ? sum(idx.map((i) => pts[i])) : ''}</td></tr>`;
      }
    }
    return html + '</tbody></table>';
  }

  function cardSummary(st, day, players) {
    const c = COURSES[day];
    if (day === 'day1') {
      return `<table class="lb sum"><thead><tr><th class="l">Player</th><th>Out</th><th>In</th><th>Total</th><th>H'cap</th><th>Nett</th></tr></thead><tbody>${
        players.map((p) => {
          const sc = st.scores.day1[p], ch = chFor(st, 'day1', p);
          const out = sc.slice(0, 9), inn = sc.slice(9);
          const all = played(sc) === 18;
          return `<tr><td class="l name">${esc(p)}</td><td>${played(out) ? sum(out) : '–'}</td><td>${played(inn) ? sum(inn) : '–'}</td>
            <td class="b">${played(sc) ? sum(sc) : '–'}</td><td>${fmtCH(ch)}</td><td class="big">${all && ch != null ? sum(sc) - ch : '–'}</td></tr>`;
        }).join('')}</tbody></table>`;
    }
    return `<table class="lb sum"><thead><tr><th class="l">Player</th><th>Strokes</th><th>H'cap</th><th>Out pts</th><th>In pts</th><th>Points</th></tr></thead><tbody>${
      players.map((p) => {
        const pts = pointsFor(st, p), sc = st.scores.day2[p];
        return `<tr><td class="l name">${esc(p)}</td><td>${played(sc) ? sum(sc) : '–'}</td><td>${fmtCH(chFor(st, 'day2', p))}</td>
          <td>${sum(pts.slice(0, 9))}</td><td>${sum(pts.slice(9))}</td><td class="big">${sum(pts)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function vCard(st, day) {
    const groups = groupsFor(st, day);
    if (!groups) {
      return `<div class="empty"><h2>Groups not set yet</h2><p>The Day 2 groups are filled from the teams, which are drawn once all three Day 1 groups have completed their round.</p>
        <p class="muted">Group 1: A1, B1, C1 · Group 2: A2, D1, E1 · Group 3: B2, C2, D2, E2</p></div>`;
    }
    const g = Math.min(ui.group[day] || 0, 2);
    const players = groups[g];
    const cur = currentHole(st, day, players);
    const complete = st.complete[day][g];
    const pills = `<div class="pills">${groups.map((ps, i) => `<button class="${i === g ? 'on' : ''}" data-act="group" data-g="${i}">
      <b>Group ${i + 1}</b><small>${ps.map(esc).join(', ')}</small>${st.complete[day][i] ? '<em>✓</em>' : ''}</button>`).join('')}</div>`;

    let actions;
    if (complete) {
      actions = `<div class="done-badge">✓ Round complete</div><button class="btn block" data-act="open-entry">Edit scores</button>`;
    } else if (cur === 19) {
      actions = `<button class="btn primary block big" data-act="complete">Complete Round</button><button class="btn block" data-act="open-entry">Edit scores</button>`;
    } else {
      actions = `<button class="btn primary block big" data-act="open-entry">Submit scores · Hole ${cur}</button>`;
    }

    return pills + `<div class="cardwrap">
      <div class="cardhead"><span>${COURSES[day].name}</span><span class="tee">Yellow tees · CR ${COURSES[day].cr.toFixed(1)} · Slope ${COURSES[day].slope}</span></div>
      ${cardHalf(st, day, players, false, cur)}${cardHalf(st, day, players, true, cur)}</div>
      ${cardSummary(st, day, players)}
      <div class="actions">${actions}</div>
      <p class="note">• = handicap stroke received on that hole. ○ birdie or better, □ bogey or worse.</p>`;
  }

  function holeInfo(day, hole) {
    const c = COURSES[day], i = hole - 1;
    return `<div class="hinfo"><span>Par <b>${c.par[i]}</b></span><span><b>${c.yards[i]}</b> yds</span><span>S.I. <b>${c.si[i]}</b></span></div>`;
  }

  function shotsText(st, day, p, hole) {
    const ch = chFor(st, day, p);
    const s = GW.shotsReceived(ch, COURSES[day].si[hole - 1]);
    const base = `H'cap ${fmtCH(ch)}`;
    if (s > 0) return `${base} · receives ${s} shot${s > 1 ? 's' : ''}`;
    if (s < 0) return `${base} · gives ${-s} shot${s < -1 ? 's' : ''}`;
    return `${base} · no shot`;
  }

  function vEntry(st) {
    const e = ui.entry;
    const groups = groupsFor(st, e.day);
    if (!groups) { ui.entry = null; return ''; }
    const players = groups[e.g];
    const cur = currentHole(st, e.day, players);
    if (e.hole > cur) { e.hole = cur; e.pi = firstMissing(st, e.day, players, cur); e.sel = null; }
    const c = COURSES[e.day];
    const top = `<div class="sheet-top">
      <button class="arrow" data-act="nav" data-d="-1" ${e.hole <= 1 ? 'disabled' : ''} aria-label="Previous hole">‹</button>
      <div class="sheet-title">${e.hole === 19 ? 'All holes in' : `Hole ${e.hole}`}<small>Group ${e.g + 1}${e.hole < cur ? ' · editing' : ''}</small></div>
      <button class="arrow" data-act="nav" data-d="1" ${e.hole >= cur ? 'disabled' : ''} aria-label="Next hole">›</button>
      <button class="close" data-act="close-entry" aria-label="Close">✕</button>
    </div>`;
    let body;

    if (e.hole === 19) {
      const complete = st.complete[e.day][e.g];
      body = `<div class="alldone"><p>All 18 holes have been submitted for Group ${e.g + 1}.</p>
        ${complete ? '<div class="done-badge">✓ Round complete</div>' : `<button class="btn primary block big" data-act="complete">Complete Round</button>`}
        <p class="muted">Use ‹ to go back and check or edit any hole.</p></div>`;
    } else if (e.hole === cur) {
      const p = players[e.pi];
      const existing = st.scores[e.day][p][e.hole - 1];
      const sel = e.sel ?? existing;
      const par = c.par[e.hole - 1];
      const chips = players.map((q, i) => {
        const v = st.scores[e.day][q][e.hole - 1];
        return `<button class="chip ${i === e.pi ? 'on' : ''} ${v != null ? 'has' : ''}" data-act="chip" data-i="${i}">${esc(q)}${v != null ? ` <b>${v}</b>` : ''}</button>`;
      }).join('');
      let preview = '';
      if (e.day === 'day2' && sel != null) {
        const pts = GW.stablefordPoints(sel, par, GW.shotsReceived(chFor(st, 'day2', p), c.si[e.hole - 1]));
        preview = `<div class="preview">${sel} strokes = <b>${pts} point${pts === 1 ? '' : 's'}</b></div>`;
      }
      body = holeInfo(e.day, e.hole) + `<div class="chips">${chips}</div>
        <div class="who"><h2>${esc(p)}</h2><p>${shotsText(st, e.day, p, e.hole)}</p></div>
        <div class="grid">${range(1, 13).map((n) => `<button class="num ${sel === n ? 'sel' : ''} ${n === par ? 'par' : ''}" data-act="pick" data-n="${n}">${n}</button>`).join('')}</div>
        ${preview}
        <button class="btn primary block big" data-act="submit-one" ${sel == null ? 'disabled' : ''}>${sel == null ? 'Select strokes' : `Submit ${esc(p)}: ${sel}`}</button>`;
    } else {
      const changed = players.some((p) => e.edits[p] != null && e.edits[p] !== st.scores[e.day][p][e.hole - 1]);
      body = holeInfo(e.day, e.hole) + `<div class="edits">${players.map((p) => {
        const v = e.edits[p] ?? st.scores[e.day][p][e.hole - 1];
        let pts = '';
        if (e.day === 'day2') pts = `<small>${GW.stablefordPoints(v, c.par[e.hole - 1], GW.shotsReceived(chFor(st, 'day2', p), c.si[e.hole - 1]))} pts</small>`;
        return `<div class="erow"><div class="ename">${esc(p)}<small>${shotsText(st, e.day, p, e.hole)}</small></div>
          <div class="stepper"><button data-act="step" data-p="${esc(p)}" data-d="-1">−</button><span>${v}${pts}</span><button data-act="step" data-p="${esc(p)}" data-d="1">+</button></div></div>`;
      }).join('')}</div>
        <button class="btn primary block big" data-act="save-edit" ${changed ? '' : 'disabled'}>Save</button>
        <p class="muted center">No changes? Just use the arrows to move on.</p>`;
    }
    return `<div class="overlay"><div class="sheet">${top}<div class="sheet-body">${body}</div></div></div>`;
  }

  function live() {
    return online === false
      ? '<div class="live off">● Offline — showing last saved scores</div>'
      : '<div class="live">● Live — updates automatically every few seconds</div>';
  }

  function vSync() {
    if (lastError && !pending.length) return `<div class="sync err">⚠ ${esc(lastError)}</div>`;
    if (!pending.length) return online === false ? `<div class="sync off">Offline — showing last saved scores</div>` : '';
    const n = pending.length;
    return online === false
      ? `<div class="sync off">Offline — ${n} change${n > 1 ? 's' : ''} saved on this phone, will sync automatically</div>`
      : `<div class="sync">Saving…</div>`;
  }

  // ---------- routing + render ----------
  function route() { return location.hash.replace(/^#\/?/, ''); }

  let lastHtml = '';
  function isTyping() { const a = document.activeElement; return a && a.tagName === 'INPUT'; }

  function render(opts) {
    if (opts && opts.poll && isTyping()) return;
    const st = view();
    const r = route();
    let html;
    if (r === 'handicaps') html = vHandicaps(st);
    else if (r === 'day1' || r === 'day2') html = vDay(st, r, 'lb');
    else if (r === 'day1/card' || r === 'day2/card') html = vDay(st, r.slice(0, 4), 'card');
    else html = vHome(st);
    if (ui.entry) html += vEntry(st);
    html += vSync();
    if (ui.toast) html += `<div class="toast">${esc(ui.toast)}</div>`;
    document.body.classList.toggle('locked', !!ui.entry);
    if (html !== lastHtml) {
      document.getElementById('app').innerHTML = html;
      lastHtml = html;
    }
  }

  let toastTimer;
  function toast(msg) {
    ui.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast = null; render(); }, 3500);
    render();
  }

  window.addEventListener('hashchange', () => { ui.entry = null; ui.hcpEditing = false; render(); window.scrollTo(0, 0); });

  // ---------- actions ----------
  function ensureTeamsLocked(st) {
    if (!st.teams) { const t = teamsFor(st); if (t) send({ op: 'lockTeams', teams: t }); }
  }

  const actions = {
    'hcp-submit'(d) {
      const st = view();
      const input = document.querySelector(`input[data-hcp="${CSS.escape(d.p)}"]`);
      const v = parseHI(input ? input.value : ui.hcpDraft[d.p]);
      if (v === undefined || isNaN(v)) return toast(`Enter a valid handicap for ${d.p} (e.g. 14.2)`);
      ui.hcpDraft[d.p] = draftHI(v);
      send({ op: 'setHandicap', player: d.p, value: v });
      if (PLAYERS.every((p) => p === d.p || st.handicaps[p] != null)) window.scrollTo(0, 0);
    },
    'hcp-edit'() {
      const st = view();
      ui.editDraft = Object.fromEntries(PLAYERS.map((p) => [p, draftHI(st.handicaps[p])]));
      ui.hcpEditing = true; render();
    },
    'hcp-cancel'() { ui.hcpEditing = false; render(); },
    'hcp-save'() {
      const st = view();
      const changes = [];
      for (const p of PLAYERS) {
        const v = parseHI(ui.editDraft[p]);
        if (v === undefined || isNaN(v)) return toast(`Enter a valid handicap for ${p}`);
        if (v !== st.handicaps[p]) changes.push({ op: 'setHandicap', player: p, value: v });
      }
      ui.hcpEditing = false;
      ui.hcpDraft = {};
      changes.forEach(send);
      render();
      if (changes.length) toast(`Saved ${changes.length} change${changes.length > 1 ? 's' : ''}`);
    },
    reset() {
      const typed = prompt('This deletes ALL handicaps and scores for everyone.\n\nType RESET to confirm.');
      if (typed !== 'RESET') return;
      ui.hcpDraft = {};
      send({ op: 'reset', confirm: 'RESET' });
      location.hash = '#/';
    },
    group(d) {
      const day = route().slice(0, 4);
      ui.group[day] = Number(d.g); lsSet(LS.group, ui.group); render();
    },
    'open-entry'() {
      const st = view();
      const day = route().slice(0, 4);
      const g = ui.group[day] || 0;
      const players = groupsFor(st, day)[g];
      const cur = currentHole(st, day, players);
      ui.entry = { day, g, hole: cur, pi: cur === 19 ? 0 : firstMissing(st, day, players, cur), sel: null, edits: {} };
      render();
    },
    'close-entry'() { ui.entry = null; render(); },
    nav(d) {
      const st = view(), e = ui.entry;
      const players = groupsFor(st, e.day)[e.g];
      const cur = currentHole(st, e.day, players);
      e.hole = Math.max(1, Math.min(cur, e.hole + Number(d.d)));
      e.edits = {}; e.sel = null;
      if (e.hole === cur && cur < 19) e.pi = firstMissing(st, e.day, players, cur);
      render();
    },
    pick(d) { ui.entry.sel = Number(d.n); render(); },
    chip(d) { ui.entry.pi = Number(d.i); ui.entry.sel = null; render(); },
    'submit-one'() {
      const st = view(), e = ui.entry;
      const players = groupsFor(st, e.day)[e.g];
      const p = players[e.pi];
      const val = e.sel ?? st.scores[e.day][p][e.hole - 1];
      if (val == null) return;
      if (e.day === 'day2') ensureTeamsLocked(st);
      send({ op: 'setScores', day: e.day, entries: [{ player: p, hole: e.hole, strokes: val }] });
      const after = view();
      const cur = currentHole(after, e.day, players);
      e.sel = null;
      if (cur !== e.hole) {
        e.hole = cur;
        e.pi = cur === 19 ? 0 : firstMissing(after, e.day, players, cur);
      } else {
        // next player still missing on this hole, searching forward from the current one
        const n = players.length;
        for (let k = 1; k <= n; k++) {
          const idx = (e.pi + k) % n;
          if (after.scores[e.day][players[idx]][e.hole - 1] == null) { e.pi = idx; break; }
        }
      }
      render();
    },
    step(d) {
      const st = view(), e = ui.entry;
      const base = e.edits[d.p] ?? st.scores[e.day][d.p][e.hole - 1];
      e.edits[d.p] = Math.max(1, Math.min(20, base + Number(d.d)));
      render();
    },
    'save-edit'() {
      const st = view(), e = ui.entry;
      const entries = Object.entries(e.edits)
        .filter(([p, v]) => v !== st.scores[e.day][p][e.hole - 1])
        .map(([p, v]) => ({ player: p, hole: e.hole, strokes: v }));
      if (entries.length) send({ op: 'setScores', day: e.day, entries });
      e.edits = {};
      toast(`Hole ${e.hole} updated`);
    },
    complete() {
      const st = view();
      const day = ui.entry ? ui.entry.day : route().slice(0, 4);
      const g = ui.entry ? ui.entry.g : ui.group[day] || 0;
      if (day === 'day2') ensureTeamsLocked(st);
      send({ op: 'setComplete', day, group: g + 1, done: true });
      ui.entry = null;
      location.hash = '#/' + day;
      toast(`Group ${g + 1} round complete`);
    },
  };

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-go],[data-act]');
    if (!t || t.disabled) return;
    if (t.dataset.go != null) { location.hash = '#/' + t.dataset.go; return; }
    const fn = actions[t.dataset.act];
    if (fn) fn(t.dataset);
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.hcp) {
      ui.hcpDraft[t.dataset.hcp] = t.value;
      const btn = t.parentElement.querySelector('button');
      if (btn) btn.outerHTML = hcpButton(t.dataset.hcp, t.value, view().handicaps[t.dataset.hcp]);
      lastHtml = '';
    } else if (t.dataset.edit) {
      ui.editDraft[t.dataset.edit] = t.value;
      const v = parseHI(t.value);
      const span = t.parentElement.querySelector('.chs');
      if (span) span.textContent = v !== undefined && !isNaN(v) ? `K ${fmtCH(GW.courseHandicap('day1', v))} · E ${fmtCH(GW.courseHandicap('day2', v))}` : '';
      lastHtml = '';
    }
  });

  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (ev.key === 'Enter' && t.dataset && t.dataset.hcp) { t.blur(); actions['hcp-submit']({ p: t.dataset.hcp }); }
  });

  render();
  refresh();
  if (pending.length) flush();
})();
