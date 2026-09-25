// GET  /api/state  -> full weekend state
// POST /api/state  -> apply one operation, then return full state
const store = require('./_store');
const GW = require('../public/data.js');

const K = {
  hcp: 'gw:hcp',
  complete: 'gw:complete',
  teams: 'gw:teams',
  ver: 'gw:ver', // bumped on every write so clients can cheaply ask "anything new?"
  scores: (d) => 'gw:scores:' + d,
};
const DAYS = ['day1', 'day2'];

function bad(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function pairs(arr) {
  const o = {};
  for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

async function readState() {
  const [h, s1, s2, c, t, v] = await store.exec([
    ['HGETALL', K.hcp],
    ['HGETALL', K.scores('day1')],
    ['HGETALL', K.scores('day2')],
    ['HGETALL', K.complete],
    ['GET', K.teams],
    ['GET', K.ver],
  ]);
  const st = GW.emptyState();
  st.ver = String(v || 0);
  for (const [p, v] of Object.entries(pairs(h))) if (GW.PLAYERS.includes(p)) st.handicaps[p] = parseFloat(v);
  [['day1', s1], ['day2', s2]].forEach(([d, raw]) => {
    for (const [f, v] of Object.entries(pairs(raw))) {
      const [p, hs] = f.split('|');
      const hole = Number(hs);
      if (st.scores[d][p] && hole >= 1 && hole <= 18) st.scores[d][p][hole - 1] = parseInt(v, 10);
    }
  });
  for (const f of Object.keys(pairs(c))) {
    const [d, g] = f.split('|');
    if (st.complete[d] && g >= 1 && g <= 3) st.complete[d][g - 1] = true;
  }
  if (t) {
    try { st.teams = typeof t === 'string' ? JSON.parse(t) : t; } catch {}
  }
  return st;
}

function validTeams(t) {
  if (!t || typeof t !== 'object') return false;
  const keys = ['A', 'B', 'C', 'D', 'E'];
  if (Object.keys(t).sort().join() !== keys.join()) return false;
  const all = keys.flatMap((k) => t[k]);
  return keys.every((k) => Array.isArray(t[k]) && t[k].length === 2) &&
    all.every((p) => GW.PLAYERS.includes(p)) && new Set(all).size === 10;
}

function buildCommands(b) {
  if (!b || typeof b !== 'object') throw bad('Missing body');
  switch (b.op) {
    case 'setHandicap': {
      if (!GW.PLAYERS.includes(b.player)) throw bad('Unknown player');
      if (b.value == null) return [['HDEL', K.hcp, b.player]];
      const v = Number(b.value);
      if (!isFinite(v) || v < -10 || v > 54) throw bad('Handicap must be between +10 and 54');
      return [['HSET', K.hcp, b.player, String(Math.round(v * 10) / 10)]];
    }
    case 'setScores': {
      if (!DAYS.includes(b.day)) throw bad('Unknown day');
      if (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 80) throw bad('Bad entries');
      const set = [], del = [];
      for (const e of b.entries) {
        if (!GW.PLAYERS.includes(e.player)) throw bad('Unknown player');
        if (!(Number.isInteger(e.hole) && e.hole >= 1 && e.hole <= 18)) throw bad('Bad hole');
        const f = e.player + '|' + e.hole;
        if (e.strokes == null) del.push(f);
        else if (Number.isInteger(e.strokes) && e.strokes >= 1 && e.strokes <= 20) set.push(f, String(e.strokes));
        else throw bad('Strokes must be 1-20');
      }
      const cmds = [];
      if (set.length) cmds.push(['HSET', K.scores(b.day), ...set]);
      if (del.length) cmds.push(['HDEL', K.scores(b.day), ...del]);
      return cmds;
    }
    case 'setComplete': {
      if (!DAYS.includes(b.day) || ![1, 2, 3].includes(b.group)) throw bad('Bad group');
      const f = b.day + '|' + b.group;
      return [b.done ? ['HSET', K.complete, f, '1'] : ['HDEL', K.complete, f]];
    }
    case 'lockTeams': {
      if (!validTeams(b.teams)) throw bad('Bad teams');
      return [['SET', K.teams, JSON.stringify(b.teams), 'NX']];
    }
    case 'reset': {
      if (b.confirm !== 'RESET') throw bad('Reset not confirmed');
      return [['DEL', K.hcp, K.complete, K.teams, K.scores('day1'), K.scores('day2')]];
    }
    default:
      throw bad('Unknown operation');
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const cmds = buildCommands(body);
      if (cmds.length) await store.exec([...cmds, ['INCR', K.ver]]);
    } else if (req.method === 'GET') {
      const known = new URL(req.url, 'http://x').searchParams.get('v');
      if (known != null) {
        const [v] = await store.exec([['GET', K.ver]]);
        if (String(v || 0) === known) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ unchanged: true, ver: known }));
        }
      }
    } else {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    res.statusCode = 200;
    res.end(JSON.stringify(await readState()));
  } catch (e) {
    res.statusCode = e.status || 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
