// The review server applies single operations to feedback.json as it is on disk.   Run: node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'om-sdd-mockup', 'review', 'server.mjs');

async function withServer(fn) {
  const change = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-review-'));
  const port = 4800 + Math.floor(Math.random() * 400);
  const child = spawn('node', [SERVER, '--change', change, '--port', String(port)], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const file = path.join(change, 'mockup', 'feedback.json');
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(`${base}/__sdd/feedback`); break; } catch { await new Promise((r) => setTimeout(r, 50)); }
    }
    const post = (op, headers = {}) => fetch(`${base}/__sdd/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(op) });
    await fn({ base, file, post, read: () => JSON.parse(fs.readFileSync(file, 'utf8')).comments });
  } finally { child.kill(); }
}

const comment = (id, body) => ({ id, body, target: { selector: '#x', tag: 'button', screen: 'orders' } });

test('a resolution written by the agent survives a later comment from an open page', () => withServer(async ({ file, post, read }) => {
  await post({ op: 'add', comment: comment('c1', 'Move the button') });
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.comments[0].status = 'resolved';
  doc.comments[0].resolution = 'moved to the toolbar';
  fs.writeFileSync(file, JSON.stringify(doc));
  await post({ op: 'add', comment: comment('c2', 'Second comment') });
  const comments = read();
  assert.equal(comments.length, 2);
  assert.equal(comments[0].status, 'resolved');
  assert.equal(comments[0].resolution, 'moved to the toolbar');
  assert.match(fs.readFileSync(file.replace('.json', '.md'), 'utf8'), /Resolution: moved to the toolbar/);
}));

test('status and delete change one comment only', () => withServer(async ({ post, read }) => {
  await post({ op: 'add', comment: comment('c1', 'one') });
  await post({ op: 'add', comment: comment('c2', 'two') });
  await post({ op: 'status', id: 'c1', status: 'resolved' });
  await post({ op: 'delete', id: 'c2' });
  assert.deepEqual(read().map((c) => [c.id, c.status]), [['c1', 'resolved']]);
}));

test('a broken feedback.json is an error and is never overwritten', () => withServer(async ({ base, file, post }) => {
  await post({ op: 'add', comment: comment('c1', 'one') });
  fs.writeFileSync(file, '{broken');
  assert.equal((await fetch(`${base}/__sdd/feedback`)).status, 500);
  assert.equal((await post({ op: 'add', comment: comment('c2', 'two') })).status, 400);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
}));

test('writes from a non-local origin are refused and paths cannot leave the mockup folder', () => withServer(async ({ base, post }) => {
  assert.equal((await post({ op: 'add', comment: comment('c1', 'x') }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ op: 'add', comment: comment('c1', 'x') }, { Origin: 'http://localhost:3000' })).status, 200);
  const res = await fetch(`${base}/..%2f..%2f..%2fetc%2fpasswd`);
  assert.notEqual(res.status, 200);
}));
