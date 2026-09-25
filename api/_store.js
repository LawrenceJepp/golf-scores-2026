// Tiny Redis-command store. Uses Upstash Redis (REST) when configured, otherwise a local JSON file for development.
const fs = require('fs');
const path = require('path');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstash(cmds) {
  const r = await fetch(URL_.replace(/\/$/, '') + '/multi-exec', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('Storage error ' + r.status + ': ' + (await r.text()));
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

const FILE = path.join(process.cwd(), '.data', 'db.json');

async function file(cmds) {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const out = cmds.map(([cmd, key, ...args]) => {
    switch (cmd.toUpperCase()) {
      case 'HSET':
        db[key] = db[key] || {};
        for (let i = 0; i < args.length; i += 2) db[key][args[i]] = String(args[i + 1]);
        return 1;
      case 'HDEL':
        if (db[key]) args.forEach((f) => delete db[key][f]);
        return 1;
      case 'HGETALL':
        return Object.entries(db[key] || {}).flat();
      case 'GET':
        return db[key] ?? null;
      case 'SET':
        if (args.includes('NX') && db[key] != null) return null;
        db[key] = String(args[0]);
        return 'OK';
      case 'INCR':
        db[key] = String(Number(db[key] || 0) + 1);
        return Number(db[key]);
      case 'DEL':
        [key, ...args].forEach((k) => delete db[k]);
        return 1;
      default:
        throw new Error('Unsupported command ' + cmd);
    }
  });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
  return out;
}

async function notConfigured() {
  throw new Error('Storage not configured: connect an Upstash Redis database to this Vercel project.');
}

module.exports = {
  exec: URL_ && TOKEN ? upstash : process.env.VERCEL ? notConfigured : file,
};
