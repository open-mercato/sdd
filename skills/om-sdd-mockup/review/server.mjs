#!/usr/bin/env node
// SDD mockup review server. No dependencies. Binds to 127.0.0.1 only.
//
//   node server.mjs --change .ai/specs/2026-11-20-csv-export [--port 4747] [--static <dir>]
//
// GET  /__sdd/review.js   the review overlay
// GET  /__sdd/feedback    { change, comments }
// POST /__sdd/feedback    one operation: {op:'add',comment} | {op:'status',id,status} | {op:'delete',id}
//                         applied to the file as it is now, so edits made by the agent are never overwritten
// GET  /*                 static files from --static (default <change>/mockup)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const changeDir = flag('change');
if (!changeDir || !fs.existsSync(changeDir)) {
  console.error('Usage: node server.mjs --change <change folder> [--port 4747] [--static <dir>]');
  process.exit(2);
}
const port = Number(flag('port', '4747'));
const mockupDir = path.resolve(changeDir, 'mockup');
const staticDir = path.resolve(flag('static', mockupDir));
const here = path.dirname(fileURLToPath(import.meta.url));
const jsonFile = path.join(mockupDir, 'feedback.json');
const mdFile = path.join(mockupDir, 'feedback.md');
const changeId = path.basename(path.resolve(changeDir));
fs.mkdirSync(mockupDir, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

// Comments come from a browser: keep only known fields, as bounded strings.
function clean(c) {
  const t = c && typeof c.target === 'object' && c.target ? c.target : {};
  return {
    id: str(c.id, 40) || 'c' + Date.now().toString(36),
    status: c.status === 'resolved' ? 'resolved' : 'open',
    body: str(c.body, 4000) || '',
    target: {
      sddId: str(t.sddId, 200), exact: t.exact !== false, selector: str(t.selector, 500) || '', tag: str(t.tag, 40) || '',
      text: str(t.text, 200) || '', ac: str(t.ac, 40), screen: str(t.screen, 200) || '', state: str(t.state, 100),
    },
    url: str(c.url, 500) || '',
    viewport: str(c.viewport, 20) || '',
    createdAt: str(c.createdAt, 40) || new Date().toISOString(),
    ...(str(c.resolution, 2000) ? { resolution: str(c.resolution, 2000) } : {}),
  };
}

function toMarkdown(comments) {
  const open = comments.filter((c) => c.status === 'open');
  const lines = [`# Mockup feedback: ${changeId}`, '', `Open: ${open.length} · Resolved: ${comments.length - open.length}`, ''];
  comments.forEach((c, i) => {
    const t = c.target;
    const name = !t.sddId ? t.selector : t.exact === false ? `${t.sddId} > ${t.tag}` : t.sddId;
    lines.push(`## ${i + 1}. [${c.status}] ${name}${t.ac ? ` (${t.ac})` : ''}`, '');
    lines.push('> ' + c.body.replace(/\n/g, '\n> '), '');
    lines.push(`- Screen: ${t.screen}${t.state ? ` · state: ${t.state}` : ''}`);
    lines.push(`- Element: <${t.tag}>${t.text ? ` "${t.text}"` : ''} · \`${t.selector}\``);
    lines.push(`- Viewport: ${c.viewport} · ${c.createdAt}`);
    if (c.resolution) lines.push(`- Resolution: ${c.resolution}`);
    lines.push('');
  });
  return lines.join('\n');
}

// A file that exists but cannot be parsed is an error, never an empty list: writing over it would lose comments.
function readFeedback() {
  if (!fs.existsSync(jsonFile)) return [];
  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (!Array.isArray(doc.comments)) throw new Error('feedback.json has no comments array');
  return doc.comments;
}

function apply(op) {
  const comments = readFeedback();
  if (op.op === 'add') {
    const c = clean(op.comment || {});
    if (!c.body) throw new Error('empty comment');
    if (!comments.some((x) => x.id === c.id)) comments.push(c);
  } else if (op.op === 'status') {
    const c = comments.find((x) => x.id === op.id);
    if (c) c.status = op.status === 'resolved' ? 'resolved' : 'open';
  } else if (op.op === 'delete') {
    const i = comments.findIndex((x) => x.id === op.id);
    if (i >= 0) comments.splice(i, 1);
  } else throw new Error('unknown op');
  if (comments.length > 500) throw new Error('too many comments');
  writeFeedback(comments);
  return comments;
}

function writeFeedback(comments) {
  fs.writeFileSync(jsonFile, JSON.stringify({ change: changeId, comments }, null, 2) + '\n');
  fs.writeFileSync(mdFile, toMarkdown(comments));
}

const isLocal = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin || '');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const origin = req.headers.origin;
  if (origin && isLocal(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  const send = (code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (req.method === 'OPTIONS') return send(204, '');

  if (url.pathname === '/__sdd/review.js') {
    return send(200, fs.readFileSync(path.join(here, 'review.js')), TYPES['.js']);
  }

  if (url.pathname === '/__sdd/feedback') {
    if (req.method === 'GET') {
      try { return send(200, JSON.stringify({ change: changeId, comments: readFeedback() }), TYPES['.json']); }
      catch (err) { return send(500, 'feedback.json is not valid: ' + (err.message || err)); }
    }
    if (req.method === 'POST') {
      if (origin && !isLocal(origin)) return send(403, 'Local origins only');
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; if (raw.length > 1e5) req.destroy(); });
      req.on('end', () => {
        try { send(200, JSON.stringify({ change: changeId, comments: apply(JSON.parse(raw)) }), TYPES['.json']); }
        catch (err) { send(400, String(err.message || err)); }
      });
      return;
    }
    return send(405, 'Method not allowed');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(staticDir, '.' + rel);
  if (file !== staticDir && !file.startsWith(staticDir + path.sep)) return send(403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(404, 'Not found');
    send(200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Review server: http://127.0.0.1:${port}/`);
  console.log(`Overlay:       http://127.0.0.1:${port}/__sdd/review.js`);
  console.log(`Feedback:      ${path.relative(process.cwd(), jsonFile)}`);
});
