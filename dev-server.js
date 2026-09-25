// Local development server: serves /public and the /api/state function (stores data in .data/db.json).
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/state');

const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/state') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { req.body = body ? JSON.parse(body) : undefined; } catch { req.body = body; }
      handler(req, res);
    });
    return;
  }
  let file = path.join(PUB, decodeURIComponent(u.pathname));
  if (!file.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
  if (u.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => console.log('Golf Weekend running at http://localhost:' + PORT));
