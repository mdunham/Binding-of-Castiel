// serve.js — zero-dependency static file server for the project root.
// ES modules + fetch('../content.json') require http(s), not file://.
// Usage: node serve.js  [port]   then open http://localhost:8080/game/

import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Save endpoint: the designer POSTs the full content.json here to write it to disk.
// Localhost-only dev convenience — validates JSON shape before overwriting.
async function handleSave(req, res) {
  const remote = req.socket.remoteAddress || '';
  if (!remote.includes('127.0.0.1') && remote !== '::1' && !remote.includes('::ffff:127.0.0.1')) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'save allowed from localhost only' }));
    return;
  }
  let body = '';
  let tooBig = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 5_000_000) { tooBig = true; req.destroy(); }
  });
  req.on('end', async () => {
    if (tooBig) return;
    try {
      const data = JSON.parse(body);
      if (!Array.isArray(data.characters) || !Array.isArray(data.weapons)) {
        throw new Error('expected characters[] and weapons[]');
      }
      await writeFile(join(ROOT, 'content.json'), JSON.stringify(data, null, 2) + '\n');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && new URL(req.url, 'http://x').pathname === '/api/save') {
      return handleSave(req, res);
    }
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/game/index.html';
    // Prevent path traversal.
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safe);

    let info = await stat(filePath).catch(() => null);
    if (info && info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('500: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`IsaacLike running:`);
  console.log(`  Game     →  http://localhost:${PORT}/game/`);
  console.log(`  Designer →  http://localhost:${PORT}/designer/`);
  console.log(`Ctrl+C to stop.`);
});
