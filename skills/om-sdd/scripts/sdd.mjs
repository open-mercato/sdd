#!/usr/bin/env node
// SDD state and gates. No dependencies, no model: every answer here is deterministic.
//
//   node sdd.mjs init
//   node sdd.mjs new <slug> [--title "..."] [--no-ui] [--brief <existing brief.md>] [--source <requirements file>]
//   node sdd.mjs status [change] [--json]
//   node sdd.mjs gate <stage> [change]          exit 0 when the stage may start
//   node sdd.mjs check [change]                 traceability: criteria, plan, mockup, feedback
//   node sdd.mjs approve <spec|mockup|secure> [change] [--by <name>]
//   node sdd.mjs done <stage> [change] [--verdict <v>] [--pr <n>] [--unconfirmed]   (discover only: no owner was available)
//   node sdd.mjs skip mockup [change] --reason "..."
//
//   node sdd.mjs plan [change]                  plan steps and their progress
//   node sdd.mjs step next|done <id> [change] [--sha <sha>]
//   node sdd.mjs run-gate [change]              runs validation.commands, records the result
//   node sdd.mjs diff-signals [change] [--base <ref>] [--json]
//   node sdd.mjs evidence [change] [--base <ref>]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const STAGES = ['discover', 'spec', 'mockup', 'secure', 'validate', 'implement', 'verify', 'archive'];
const SKILL = {
  discover: 'om-sdd-discover', spec: 'om-sdd-spec', mockup: 'om-sdd-mockup', secure: 'om-sdd-secure', validate: 'om-sdd-validate',
  implement: 'om-sdd-implement', verify: 'om-sdd-verify', archive: 'om-sdd-archive',
};

const BOOLEAN = new Set(['json', 'no-ui', 'unconfirmed']);
const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (BOOLEAN.has(key) || next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
  } else pos.push(argv[i]);
}

const fail = (msg) => { console.error(msg); process.exit(1); };

// Always work from the repository root, wherever the command was typed.
const startDir = process.cwd();
const topLevel = (git(['rev-parse', '--show-toplevel']) || '').trim();
if (topLevel) {
  process.chdir(topLevel);
  for (const key of ['source', 'brief']) {
    if (flags[key] && flags[key] !== true) flags[key] = path.relative(topLevel, path.resolve(startDir, flags[key])) || '.';
  }
}

function config() {
  try { return JSON.parse(fs.readFileSync('.ai/agentic.config.json', 'utf8')); } catch { return {}; }
}

function specsDir() {
  const cfg = config();
  return (cfg.paths && cfg.paths.specs) || '.ai/specs';
}

const read = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);

function listChanges() {
  const dir = specsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => fs.existsSync(path.join(dir, name, 'change.json'))).sort();
}

function resolveChange(ref) {
  const all = listChanges();
  if (ref) {
    const base = path.basename(ref.replace(/[\\/]+$/, ''));
    const hits = all.filter((name) => name === base || name.endsWith('-' + base));
    if (hits.length === 1) return hits[0];
    fail(hits.length ? `Ambiguous change "${ref}": ${hits.join(', ')}` : `No change "${ref}". Known: ${all.join(', ') || 'none'}`);
  }
  const active = all.filter((name) => loadChange(name).stages.archive.status !== 'done');
  if (active.length === 1) return active[0];
  if (!active.length && all.length) return all[all.length - 1];
  fail(active.length ? `Several active changes, name one: ${active.join(', ')}` : `No active change on this branch (${currentBranch() || 'unknown'}). A change lives on its own branch: switch to it, or start one with node .ai/sdd/sdd.mjs new <slug>`);
}

const changePath = (id, ...rest) => path.join(specsDir(), id, ...rest);
function loadChange(id) {
  const c = JSON.parse(fs.readFileSync(changePath(id, 'change.json'), 'utf8'));
  for (const stage of STAGES) if (!c.stages[stage]) c.stages[stage] = { status: 'pending' };
  return c;
}
const saveChange = (c) => fs.writeFileSync(changePath(c.id, 'change.json'), JSON.stringify(c, null, 2) + '\n');

const PLAN = /^#{1,6}\s+(implementation\s+)?plan\s*$/i;

// ---------- reading the artifacts ----------
function section(md, titlePattern) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && titlePattern.test(l));
  if (start < 0) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

function criteria(spec) {
  const out = new Map();
  for (const m of spec.matchAll(/^#{2,6}\s+(AC-\d+)(\s*\(ui\))?/gim)) out.set(m[1].toUpperCase(), { ui: Boolean(m[2]) });
  return out;
}

const mentioned = (text) => new Set((text || '').toUpperCase().match(/AC-\d+/g) || []);
const idsIn = (text) => new Set((text || '').toUpperCase().match(/\b(AC|SEC)-\d+\b/g) || []);

// security.md: threats (T-n) with a decision, and security criteria (SEC-n) that prove the mitigations.
function security(id) {
  const md = read(changePath(id, 'security.md'));
  if (md === null) return null;
  const threats = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const t = line.match(/^#{2,6}\s+(T-\d+)\b[:\s]*(.*)$/i);
    if (t) { cur = { id: t[1].toUpperCase(), title: t[2].trim(), decision: null, sec: new Set() }; threats.push(cur); continue; }
    if (/^#{1,6}\s/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const d = line.match(/^\s*[-*]\s*Decision:\s*(mitigate|accept)\b/i);
    if (d) cur.decision = d[1].toLowerCase();
    for (const m of line.toUpperCase().match(/SEC-\d+/g) || []) cur.sec.add(m);
  }
  const sec = new Set([...md.matchAll(/^#{2,6}\s+(SEC-\d+)\b/gim)].map((m) => m[1].toUpperCase()));
  return { threats, sec, none: /^Surface:\s*none\b/im.test(md) };
}

function securityProblems(id) {
  const s = security(id);
  if (!s) return ['security.md is missing'];
  const out = [];
  if (!s.threats.length && !s.none) out.push('security.md lists no threats and does not state "Surface: none" with a reason');
  if (s.threats.length && s.none) out.push('security.md states "Surface: none" but lists threats');
  for (const t of s.threats) {
    if (!t.decision) out.push(`${t.id} has no "Decision: mitigate" or "Decision: accept" line`);
    if (t.decision === 'mitigate' && !t.sec.size) out.push(`${t.id} is mitigated but names no SEC criterion that proves it`);
    for (const id2 of t.sec) if (!s.sec.has(id2)) out.push(`${t.id} names ${id2}, which security.md does not define`);
  }
  for (const id2 of s.sec) if (!s.threats.some((t) => t.sec.has(id2))) out.push(`${id2} is not linked to any threat`);
  return out;
}

function openQuestions(spec) {
  const body = section(spec, /open questions/i);
  if (body === null) return 0;
  return body.split('\n').filter((l) => /^\s*([-*]|\d+\.|Q\d+)/i.test(l) && !/^\s*[-*]?\s*(none|brak)\.?\s*$/i.test(l)).length;
}

function openFeedback(id) {
  const raw = read(changePath(id, 'mockup', 'feedback.json'));
  if (!raw) return 0;
  try { return (JSON.parse(raw).comments || []).filter((c) => c.status !== 'resolved').length; } catch { return -1; }
}

// A stage that was approved against an older spec is stale, whatever change.json says.
function verdictIn(id, file, options) {
  const body = read(changePath(id, file));
  const m = body && body.match(new RegExp(`verdict\\W{0,6}(${options})\\b`, 'i'));
  return m ? m[1].toLowerCase() : null;
}
const fileHash = (id, file) => { const body = read(changePath(id, file)); return body === null ? null : sha(body); };
const planHash = (c) => sha(section(read(changePath(c.id, 'spec.md')) || '', PLAN) || '');
// Steps recorded against an older plan do not count: the ids may now name different work.
const progressOf = (c) => (!c.planHash || c.planHash === planHash(c) ? c.progress || {} : {});

function effective(c) {
  const spec = read(changePath(c.id, 'spec.md'));
  const now = spec === null ? null : sha(spec);
  const s = JSON.parse(JSON.stringify(c.stages));
  if (s.spec.status === 'approved' && s.spec.hash !== now) s.spec.status = 'stale';
  if (c.source) {
    const src = read(c.source.path);
    if (src === null || sha(src) !== c.source.hash) {
      if (s.discover.status === 'done') s.discover.status = 'stale';
      if (s.spec.status === 'approved') s.spec.status = 'stale';
    } else if (s.spec.status === 'approved' && s.spec.sourceHash !== c.source.hash) s.spec.status = 'stale';
  }
  for (const stage of ['mockup', 'secure', 'validate']) {
    const done = s[stage].status === 'approved' || s[stage].status === 'done';
    if (done && (s.spec.status !== 'approved' || s[stage].specHash !== now)) s[stage].status = 'stale';
  }
  // An artifact edited after its stage was recorded no longer says what was approved or decided.
  for (const [stage, file] of [['secure', 'security.md'], ['validate', 'validation.md'], ['verify', 'verify.md']]) {
    const done = ['approved', 'done'].includes(s[stage].status);
    if (done && s[stage].fileHash && fileHash(c.id, file) !== s[stage].fileHash) s[stage].status = 'stale';
  }
  if (s.implement.status === 'done' && s.implement.specHash && (s.spec.status !== 'approved' || s.implement.specHash !== now)) s.implement.status = 'stale';
  if (s.verify.status === 'done' && (s.implement.status !== 'done' || (s.verify.state && s.verify.state !== codeState()))) s.verify.status = 'stale';
  return { stages: s, specHash: now };
}

function blockers(c, stage) {
  const { stages: s } = effective(c);
  const out = [];
  const specOk = s.spec.status === 'approved';
  const mockupOk = s.mockup.status === 'approved' || s.mockup.status === 'skipped';
  if (stage === 'mockup') {
    if (!c.ui) out.push('change has ui: false, the mockup is skipped');
    if (!specOk) out.push(`spec is ${s.spec.status}: approve it first (approve spec)`);
  }
  if (stage === 'spec' && s.discover.status === 'stale') out.push('the source requirements changed: rerun om-sdd-discover first');
  if (stage === 'secure' && !specOk) out.push(`spec is ${s.spec.status}: approve it first (approve spec)`);
  if (stage === 'validate' || stage === 'implement') {
    if (!specOk) out.push(`spec is ${s.spec.status}: approve it first (approve spec)`);
    if (!mockupOk) out.push(`mockup is ${s.mockup.status}: approve it (approve mockup) or skip it with a reason`);
    if (s.secure.status === 'in_review') out.push('security.md accepts a risk: a human must run approve secure');
    else if (!['done', 'approved'].includes(s.secure.status)) out.push(`secure is ${s.secure.status}: run om-sdd-secure`);
  }
  if (stage === 'implement') {
    if (s.validate.status !== 'done') out.push(`validate is ${s.validate.status}: run om-sdd-validate`);
    else if (s.validate.verdict === 'no-go') out.push('validate verdict is no-go: fix the spec');
  }
  if ((stage === 'validate' || stage === 'implement') && c.ui && s.mockup.status === 'approved' && openFeedback(c.id) !== 0) out.push('the mockup has open comments again: resolve them or revise the spec');
  if (stage === 'verify' || stage === 'archive') {
    out.push(...blockers(c, 'implement'));
    // A verifier may correct its report and record it again, as long as the code it verified has not moved.
    const sameCode = stage === 'verify' && c.stages.verify.state && c.stages.verify.state === codeState();
    if (s.implement.status === 'stale') out.push('the code was implemented against an older spec: rerun om-sdd-implement');
    else if (s.implement.status !== 'done' && !sameCode) out.push(`implement is ${s.implement.status}`);
  }
  if (stage === 'archive') {
    if (s.verify.status === 'stale') out.push('the code or verify.md changed after verification: rerun om-sdd-verify');
    else if (!(s.verify.status === 'done' && s.verify.verdict === 'pass')) out.push('verify has not passed');
  }
  return out;
}

function checkTrace(c) {
  const problems = [];
  const spec = read(changePath(c.id, 'spec.md'));
  if (spec === null) return ['spec.md is missing'];
  const acs = criteria(spec);
  if (!acs.size) problems.push('spec.md defines no acceptance criteria (headings like "##### AC-1: ...")');
  const q = openQuestions(spec);
  if (q) problems.push(`spec.md has ${q} open question(s)`);
  const plan = section(spec, PLAN);
  if (plan === null) problems.push('spec.md has no Plan section');
  else {
    if (!planSteps(spec).length) problems.push('the Plan has no numbered steps (use "### Phase 1: ..." and "1. ..." lines)');
    const planned = mentioned(plan);
    for (const id of acs.keys()) if (!planned.has(id)) problems.push(`${id} is not covered by any step in the Plan`);
    for (const id of planned) if (!acs.has(id)) problems.push(`Plan mentions ${id}, which the spec does not define`);
  }
  if (read(changePath(c.id, 'security.md')) !== null) problems.push(...securityProblems(c.id));
  if (c.ui) {
    const map = read(changePath(c.id, 'mockup', 'README.md'));
    if (map !== null) {
      const shown = mentioned(map);
      for (const [id, meta] of acs) if (meta.ui && !shown.has(id)) problems.push(`${id} (ui) is not shown by any mockup screen`);
      for (const id of shown) if (!acs.has(id)) problems.push(`mockup maps ${id}, which the spec does not define`);
    }
    const open = openFeedback(c.id);
    if (open < 0) problems.push('mockup/feedback.json is not valid JSON: repair it, comments cannot be counted');
    else if (open) problems.push(`mockup has ${open} open comment(s)`);
  }
  return problems;
}

// ---------- plan progress ----------
function planSteps(spec) {
  const plan = section(spec || '', PLAN);
  if (plan === null) return [];
  const steps = [];
  let phase = 0;
  let phaseName = '';
  for (const line of plan.split('\n')) {
    const ph = line.match(/^#{2,6}\s+Phase\s+(\d+)\s*:?\s*(.*)$/i);
    if (ph) { phase = Number(ph[1]); phaseName = ph[2].trim(); continue; }
    const st = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (!st) continue;
    if (!phase) phase = 1;
    steps.push({
      id: `${phase}.${st[1]}`, phase, phaseName,
      title: st[2].split(/\s+-\s+delivers\b/i)[0].trim(),
      acs: [...mentioned(st[2])],
    });
  }
  return steps;
}

// ---------- git ----------
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

const outsideSpecs = () => ['--', '.', `:(exclude)${specsDir()}`, ':(exclude).ai/sdd', ':(exclude,glob)**/skills/om-sdd*/**', ':(exclude,glob)**/om-sdd-skills/**'];

// Fingerprint of the code, ignoring the change folder: recording a stage must not invalidate a gate run.
function codeState() {
  const index = git(['ls-files', '-s', ...outsideSpecs()]);
  if (index === null) return null;
  const dirty = git(['diff', ...outsideSpecs()]) || '';
  const untracked = git(['ls-files', '-o', '--exclude-standard', ...outsideSpecs()]) || '';
  return sha(index + dirty + untracked);
}

function baseRef(soft = false) {
  let b = flags.base && flags.base !== true ? flags.base : null;
  const cfg = config();
  if (!b && cfg.baseBranch && cfg.baseBranch !== 'auto') b = cfg.baseBranch;
  if (!b) { const h = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']); if (h) b = h.trim(); }
  if (!b) b = ['main', 'master', 'develop'].find((name) => git(['rev-parse', '--verify', '--quiet', name]) !== null) || null;
  if (b && !b.startsWith('origin/') && git(['rev-parse', '--verify', '--quiet', 'origin/' + b]) !== null) b = 'origin/' + b;
  if (!b || git(['rev-parse', '--verify', '--quiet', b]) === null) {
    if (soft) return null;
    fail('Cannot find the base branch. Set baseBranch in .ai/agentic.config.json or pass --base <ref>.');
  }
  return b;
}

const currentBranch = () => (git(['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim();

// A change lives on one branch. State written from another checkout would describe the wrong code.
function requireBranch(c) {
  const now = currentBranch();
  if (c.branch && now && now !== c.branch) fail(`${c.id} lives on branch "${c.branch}", but this checkout is on "${now}". Switch to it (or use a worktree of it) and run the command again.`);
}

// The gate is what the base branch says it is. A branch cannot shorten its own gate.
function gateCommands() {
  const pick = (cfg) => [...(((cfg || {}).validation || {}).commands || []), ...(((cfg || {}).security || {}).commands || [])];
  const mine = pick(config());
  const base = baseRef(true);
  let theirs = [];
  if (base) { try { theirs = pick(JSON.parse(git(['show', `${base}:.ai/agentic.config.json`]) || '{}')); } catch { theirs = []; } }
  if (theirs.length && JSON.stringify(theirs) !== JSON.stringify(mine)) {
    fail(`The validation commands in this branch differ from ${base}. Changing the gate is a human decision made on the base branch; restore .ai/agentic.config.json.`);
  }
  return theirs.length ? theirs : mine;
}

const IS = {
  test: (f) => /(^|\/)(__tests__|tests?|e2e|specs?|cypress|playwright)\//i.test(f) || /[._-](test|spec)\.[a-z0-9]+$/i.test(f),
  migration: (f) => /migrat/i.test(f),
  doc: (f) => /\.(md|mdx|txt|rst)$/i.test(f) || /^docs\//i.test(f),
  deps: (f) => /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|composer\.(json|lock)|requirements[^/]*\.txt|poetry\.lock|pyproject\.toml|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?)$/.test(f),
  ui: (f) => /\.(tsx|jsx|vue|svelte|astro|css|scss|html|erb|twig)$/i.test(f) || /\.blade\.php$/i.test(f),
  code: (f) => /\.(ts|tsx|js|jsx|mjs|cjs|py|php|rb|go|rs|java|kt|cs|swift|vue|svelte|astro)$/i.test(f),
  schema: (f) => /(^|\/)(entit(y|ies)|schemas?|models?)(\/|\.)/i.test(f) || /\.(entity|model|schema)\.[a-z]+$/i.test(f),
  risk: (f) => /(auth|session|permission|acl|rbac|tenant|payment|billing|invoice|money|checkout|refund|migrat)/i.test(f),
};

function diffAgainstBase() {
  const base = baseRef();
  const mb = (git(['merge-base', base, 'HEAD']) || '').trim();
  if (!mb) fail(`No merge base between HEAD and ${base}`);
  const names = (git(['diff', '--name-status', '-M', mb, ...outsideSpecs()]) || '').trim().split('\n').filter(Boolean)
    .map((l) => { const parts = l.split('\t'); return { status: parts[0][0], file: parts[parts.length - 1] }; });
  for (const f of (git(['ls-files', '-o', '--exclude-standard', ...outsideSpecs()]) || '').split('\n').filter(Boolean)) names.push({ status: 'A', file: f, untracked: true });
  const added = [];
  const removed = [];
  let file = null;
  let line = 0;
  for (const l of (git(['diff', '-U0', '-M', mb, ...outsideSpecs()]) || '').split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4) === '/dev/null' ? null : l.slice(6); continue; }
    if (l.startsWith('--- ')) continue;
    const hunk = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!file) continue;
    if (l.startsWith('+')) { added.push({ file, line, text: l.slice(1) }); line++; }
    else if (l.startsWith('-')) removed.push({ file, text: l.slice(1) });
  }
  for (const n of names.filter((x) => x.untracked)) {
    const body = read(n.file);
    if (body !== null && body.length < 1e6) body.split('\n').forEach((text, i) => added.push({ file: n.file, line: i + 1, text }));
  }
  const behind = Number((git(['rev-list', '--count', `HEAD..${base}`]) || '0').trim());
  return { base, files: names, added, removed, behind };
}

// Only what this branch added counts: documentation that mentions the attribute is not a leftover.
function mockupLeftovers() {
  if (baseRef(true)) {
    const hits = diffAgainstBase().added.filter((a) => /data-sdd-|__sdd\/review\.js/.test(a.text) && !IS.doc(a.file));
    return [...new Set(hits.map((a) => `${a.file}:${a.line}`))];
  }
  const out = git(['grep', '-n', '-I', '-e', 'data-sdd-', '-e', '__sdd/review.js', ...outsideSpecs(), ':(exclude)*.md']);
  return out ? out.trim().split('\n').map((l) => l.split(':').slice(0, 2).join(':')) : [];
}

function diffSignals() {
  const d = diffAgainstBase();
  const files = d.files.map((f) => f.file);
  const at = (hits) => [...new Set(hits.map((h) => `${h.file}:${h.line}`))].slice(0, 12);
  const grep = (re, filter = () => true) => d.added.filter((a) => filter(a.file) && re.test(a.text));
  const signals = [];
  const add = (severity, title, where = []) => signals.push({ severity, title, where });

  const left = mockupLeftovers();
  if (left.length) add('blocker', 'Mockup markup or the review overlay is still in application code', left.slice(0, 12));
  if (files.includes('.ai/agentic.config.json')) add('blocker', 'The gate configuration was changed in this branch', ['.ai/agentic.config.json']);

  const secrets = grep(/AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|token|passw(or)?d)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i);
  if (secrets.length) add('blocker', 'Possible secret committed (values not shown)', at(secrets));

  const destructive = grep(/\b(drop\s+(table|column|constraint|index)|rename\s+(column|table|to)\b|truncate\s+table|alter\s+column\b.*\btype\b)|\b(dropTable|dropColumn|renameColumn|renameTable)\b/i, IS.migration);
  if (destructive.length) add('blocker', 'Destructive statement in a migration: needs a migration path', at(destructive));

  const EXPORT = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|class|type|interface|enum|let|var)\s+([A-Za-z0-9_$]+)/;
  const gone = d.removed.filter((r) => !IS.test(r.file) && EXPORT.test(r.text))
    .filter((r) => !d.added.some((a) => a.file === r.file && (a.text.match(EXPORT) || [])[1] === r.text.match(EXPORT)[1]));
  if (gone.length) add('blocker', 'Public export removed or renamed: needs a deprecation bridge', [...new Set(gone.map((r) => `${r.file}: ${r.text.match(EXPORT)[1]}`))].slice(0, 12));
  const deleted = d.files.filter((f) => f.status === 'D' && IS.code(f.file) && !IS.test(f.file)).map((f) => f.file);
  if (deleted.length) add('major', 'Source file deleted: check for consumers and public entry points', deleted.slice(0, 12));

  const source = files.filter((f) => IS.code(f) && !IS.test(f) && !IS.migration(f));
  if (source.length && !files.some(IS.test)) add('major', 'Source changed but no test file is in the diff', source.slice(0, 8));
  const schema = files.filter((f) => IS.schema(f) && !IS.test(f) && !IS.migration(f));
  if (schema.length && !files.some(IS.migration)) add('major', 'Entity or schema changed but no migration is in the diff', schema.slice(0, 8));

  const weakened = grep(/\.(skip|only)\s*\(|\b(xit|xdescribe|fdescribe|fit)\s*\(|test\.todo|@Disabled|@Ignore|pytest\.mark\.skip|markTestSkipped/, IS.test);
  if (weakened.length) add('major', 'Test skipped, focused or disabled', at(weakened));
  const count = (list, re) => list.filter((x) => IS.test(x.file) && re.test(x.text)).length;
  const ASSERT = /\b(expect|assert\w*)\s*\(|\bshould\b/;
  if (count(d.removed, ASSERT) > count(d.added, ASSERT)) add('major', `Assertions removed from tests (${count(d.removed, ASSERT)} removed, ${count(d.added, ASSERT)} added)`);
  const bypass = grep(/@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|#\s*noqa|#\s*type:\s*ignore|phpcs:ignore|@phpstan-ignore|--no-verify/);
  if (bypass.length) add('major', 'Static check silenced', at(bypass));

  const anyType = grep(/:\s*any\b|\bas any\b|<any>/, (f) => /\.tsx?$/.test(f) && !IS.test(f));
  if (anyType.length) add('minor', 'New `any` type', at(anyType));
  const debug = grep(/\bconsole\.(log|debug)\s*\(|\bdebugger\b|\bvar_dump\s*\(|\bdd\s*\(|\bbinding\.pry\b/, (f) => IS.code(f) && !IS.test(f));
  if (debug.length) add('minor', 'Debug output left in code', at(debug));

  const risk = files.filter((f) => IS.risk(f) && !IS.doc(f));
  if (risk.length) add('info', 'Risk area touched: integration-level evidence required (permissions, scoping, money, migrations)', risk.slice(0, 12));
  const deps = files.filter(IS.deps);
  if (deps.length) add('info', 'Dependencies changed: check necessity, licence and lockfile consistency', deps);
  const ui = files.filter(IS.ui);
  add('info', ui.length ? `UI surface changed in ${ui.length} file(s): browser evidence required` : 'No UI files changed', ui.slice(0, 12));
  if (d.behind) add('info', `Branch is ${d.behind} commit(s) behind ${d.base}`);
  return { base: d.base, files: files.length, signals };
}

function evidence(c) {
  const spec = read(changePath(c.id, 'spec.md')) || '';
  const d = diffAgainstBase();
  const tests = new Map();
  for (const f of d.files.filter((x) => x.status !== 'D' && IS.test(x.file))) {
    const body = read(f.file);
    if (body !== null) for (const id of idsIn(body)) tests.set(id, [...(tests.get(id) || []), f.file]);
  }
  let shots = [];
  try {
    shots = fs.readdirSync(changePath(c.id, 'screenshots')).filter((n) => fs.statSync(changePath(c.id, 'screenshots', n)).size > 0);
  } catch { /* no screenshots yet */ }
  const rows = [...criteria(spec)].map(([id, meta]) => {
    const pics = shots.filter((n) => new RegExp(`^${id}(\\D|$)`, 'i').test(n));
    const t = tests.get(id) || [];
    return { id, kind: meta.ui ? 'ui' : 'behavior', tests: t, screenshots: pics, ok: meta.ui ? pics.length > 0 : t.length > 0 };
  });
  const sec = security(c.id);
  for (const id of sec ? [...sec.sec].sort() : []) {
    const t = tests.get(id) || [];
    rows.push({ id, kind: 'security', tests: t, screenshots: [], ok: t.length > 0 });
  }
  return rows;
}

function gateGreen(c) {
  return Boolean(c.gate && c.gate.complete && c.gate.results.length && c.gate.results.every((r) => r.code === 0) && c.gate.state === codeState());
}

function archiveProblems(c) {
  const spec = read(changePath(c.id, 'spec.md')) || '';
  const out = [];
  for (const m of spec.matchAll(/^#{2,6}\s+Capability:\s*([a-z0-9-]+)/gim)) {
    const file = path.join(specsDir(), 'capabilities', `${m[1]}.md`);
    const body = read(file);
    if (body === null) out.push(`${file} is missing`);
    else if (!body.includes(c.id)) out.push(`${file} does not cite ${c.id} as a source`);
  }
  const sec = security(c.id);
  if (sec && sec.threats.length) {
    const file = path.join(specsDir(), 'security', 'threat-model.md');
    const body = read(file);
    if (body === null) out.push(`${file} is missing`);
    else if (!body.includes(c.id)) out.push(`${file} does not cite ${c.id} as a source`);
  }
  for (const m of spec.matchAll(/^Frozen by:\s*`([^`]+)`/gim)) if (m[1] !== 'none' && !fs.existsSync(m[1])) out.push(`characterization test ${m[1]} is missing`);
  return out;
}

// `approve` records a human decision. In a terminal the person types the change id; anywhere else the
// approval is refused unless the caller names the change in SDD_NONINTERACTIVE_APPROVAL, and it is then
// recorded and shown as non-interactive.
function confirmHuman(c, stage) {
  if (process.env.SDD_NONINTERACTIVE_APPROVAL === c.id) return 'non-interactive';
  if (!process.stdin.isTTY) fail(`approve ${stage} records a human decision. It must be run by a person in an interactive terminal.`);
  process.stdout.write(`You are approving "${stage}" for ${c.id}.\nType the change id to confirm: `);
  const buf = Buffer.alloc(512);
  let typed = '';
  try { typed = buf.toString('utf8', 0, fs.readSync(0, buf, 0, 512)).trim(); } catch { typed = ''; }
  if (typed !== c.id) fail('Not confirmed. Nothing was recorded.');
  return 'terminal';
}

// ---------- commands ----------
const cmd = pos[0];

if (cmd === 'init') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  fs.mkdirSync(path.join(specsDir(), 'capabilities'), { recursive: true });
  fs.mkdirSync('.ai/sdd', { recursive: true });
  for (const [from, to] of [[path.join(here, 'sdd.mjs'), '.ai/sdd/sdd.mjs'], [path.join(here, '..', 'CONVENTIONS.md'), '.ai/sdd/CONVENTIONS.md']]) {
    if (fs.existsSync(from) && path.resolve(from) !== path.resolve(to)) fs.copyFileSync(from, to);
  }
  console.log(`Ready. Conventions: .ai/sdd/CONVENTIONS.md · Specs: ${specsDir()}`);
} else if (cmd === 'new') {
  const slug = pos[1];
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail('Usage: new <kebab-case-slug> [--title "..."] [--no-ui] [--brief <path>] [--source <path>]');
  const id = `${new Date().toISOString().slice(0, 10)}-${slug}`;
  if (fs.existsSync(changePath(id))) fail(`${changePath(id)} already exists`);
  if (flags.brief && flags.brief !== true && !fs.existsSync(flags.brief)) fail(`No brief at ${flags.brief}`);
  // Start the change on its own branch when the command is run on the base branch.
  const base = baseRef(true);
  let branch = currentBranch();
  if (base && branch && branch === base.replace(/^origin\//, '')) {
    branch = flags.branch && flags.branch !== true ? flags.branch : `feat/${slug}`;
    if (git(['switch', '-c', branch]) === null) fail(`Could not create branch ${branch}. Create the change's branch yourself and run the command on it.`);
    console.log(`Branch: ${branch}`);
  }
  fs.mkdirSync(changePath(id), { recursive: true });
  const c = {
    id, title: flags.title && flags.title !== true ? flags.title : slug.replace(/-/g, ' '),
    ui: !flags['no-ui'],
    brief: flags.brief && flags.brief !== true ? flags.brief : 'brief.md',
    ...(branch && branch !== 'HEAD' ? { branch } : {}),
    stages: Object.fromEntries(STAGES.map((s) => [s, { status: 'pending' }])),
  };
  if (!c.ui) c.stages.mockup = { status: 'skipped', reason: 'no user interface' };
  if (c.brief !== 'brief.md') c.stages.discover = { status: 'done' };
  if (flags.source && flags.source !== true) {
    const src = read(flags.source);
    if (src === null) { fs.rmSync(changePath(id), { recursive: true }); fail(`No requirements file at ${flags.source}. Put a copy or an export inside the repository first.`); }
    c.source = { path: flags.source, hash: sha(src) };
  }
  saveChange(c);
  console.log(`Change: ${changePath(id)}`);
} else if (cmd === 'status') {
  const c = loadChange(resolveChange(pos[1]));
  const { stages: s } = effective(c);
  const next = s.archive.status === 'done' ? undefined : STAGES.find((stage) => !['done', 'approved', 'skipped'].includes(s[stage].status));
  const waiting = next ? blockers(c, next) : [];
  if (flags.json) {
    console.log(JSON.stringify({ id: c.id, ui: c.ui, stages: s, next: next || null, blockers: waiting }, null, 2));
  } else {
    console.log(`${c.id} · ${c.title}${c.ui ? '' : ' · no UI'}`);
    STAGES.forEach((stage, i) => {
      const extra = s[stage].verdict ? ` (${s[stage].verdict})` : s[stage].reason ? ` (${s[stage].reason})` : s[stage].unconfirmed ? ' (scope not confirmed by the owner yet)' : s[stage].via === 'non-interactive' ? ` (non-interactive approval${s[stage].by ? ', by ' + s[stage].by : ''})` : '';
      console.log(`  ${i + 1}. ${stage.padEnd(10)} ${s[stage].status}${extra}`);
    });
    const steps = planSteps(read(changePath(c.id, 'spec.md')));
    if (steps.length && s.implement.status !== 'pending') console.log(`Plan: ${steps.filter((x) => progressOf(c)[x.id]).length}/${steps.length} steps · gate ${gateGreen(c) ? 'green' : 'not green for the current code'}`);
    if (!next) console.log('Next: none, the change is archived');
    else if (waiting.length) console.log(`Next: ${next} is blocked\n${waiting.map((b) => '  - ' + b).join('\n')}`);
    else console.log(`Next: ${SKILL[next]}${s[next].status === 'in_review' ? ` (waiting for a human: approve ${next})` : ''}`);
  }
} else if (cmd === 'gate') {
  const stage = pos[1];
  if (!STAGES.includes(stage)) fail(`Usage: gate <${STAGES.join('|')}> [change]`);
  const b = blockers(loadChange(resolveChange(pos[2])), stage);
  if (b.length) fail(`Gate closed for ${stage}:\n${b.map((x) => '  - ' + x).join('\n')}`);
  console.log(`Gate open for ${stage}`);
} else if (cmd === 'check') {
  const c = loadChange(resolveChange(pos[1]));
  const problems = checkTrace(c);
  if (problems.length) fail(`Check failed:\n${problems.map((x) => '  - ' + x).join('\n')}`);
  console.log('Check passed');
} else if (cmd === 'approve') {
  const stage = pos[1];
  if (!['spec', 'mockup', 'secure'].includes(stage)) fail('Usage: approve <spec|mockup|secure> [change] [--by <name>]');
  const c = loadChange(resolveChange(pos[2]));
  requireBranch(c);
  const spec = read(changePath(c.id, 'spec.md'));
  if (spec === null) fail('spec.md is missing');
  const via = confirmHuman(c, stage);
  if (stage === 'spec') {
    const trace = checkTrace(c).filter((x) => !/mockup|security/i.test(x));
    if (trace.length) fail(`Cannot approve:\n${trace.map((x) => '  - ' + x).join('\n')}`);
    const q = openQuestions(spec);
    if (q) fail(`Cannot approve: ${q} open question(s) in spec.md`);
    if (!criteria(spec).size) fail('Cannot approve: spec.md defines no acceptance criteria');
    const b = blockers(c, 'spec');
    if (b.length) fail(`Cannot approve:\n${b.map((x) => '  - ' + x).join('\n')}`);
    c.stages.spec = { status: 'approved', hash: sha(spec), by: flags.by || null, via, at: new Date().toISOString() };
    if (c.source) c.stages.spec.sourceHash = c.source.hash;
    if (c.stages.discover.unconfirmed) { delete c.stages.discover.unconfirmed; console.log('This approval also confirms the scope in the brief.'); }
  } else if (stage === 'secure') {
    const problems = [...blockers(c, 'secure'), ...securityProblems(c.id)];
    if (problems.length) fail(`Cannot approve:\n${problems.map((x) => '  - ' + x).join('\n')}`);
    const accepted = security(c.id).threats.filter((t) => t.decision === 'accept').map((t) => t.id);
    c.stages.secure = { status: 'approved', specHash: sha(spec), fileHash: fileHash(c.id, 'security.md'), accepted, by: flags.by || null, via, at: new Date().toISOString() };
  } else {
    const b = blockers(c, 'mockup');
    if (b.length) fail(`Cannot approve:\n${b.map((x) => '  - ' + x).join('\n')}`);
    if (read(changePath(c.id, 'mockup', 'README.md')) === null) fail('Cannot approve: mockup/README.md is missing');
    const problems = checkTrace(c).filter((p) => /mockup/.test(p));
    if (problems.length) fail(`Cannot approve:\n${problems.map((x) => '  - ' + x).join('\n')}`);
    c.stages.mockup = { status: 'approved', specHash: sha(spec), by: flags.by || null, via, at: new Date().toISOString() };
  }
  saveChange(c);
  console.log(`Approved ${stage} for ${c.id}`);
} else if (cmd === 'done') {
  const stage = pos[1];
  if (!STAGES.includes(stage)) fail(`Usage: done <stage> [change] [--verdict <v>] [--pr <n>]`);
  const c = loadChange(resolveChange(pos[2]));
  requireBranch(c);
  const b = blockers(c, stage);
  if (b.length) fail(`Gate closed for ${stage}:\n${b.map((x) => '  - ' + x).join('\n')}`);
  const need = [];
  if (stage === 'implement') {
    const open = planSteps(read(changePath(c.id, 'spec.md'))).filter((s) => !progressOf(c)[s.id]);
    if (open.length) need.push(`plan steps still open: ${open.map((s) => s.id).join(', ')}`);
  }
  if (stage === 'implement' || (stage === 'verify' && flags.verdict === 'pass')) {
    if (!gateGreen(c)) need.push('no green validation run for the current code: run-gate');
    const left = mockupLeftovers();
    if (left.length) need.push(`mockup markup left in application code: ${left.slice(0, 5).join(', ')}`);
  }
  if (stage === 'verify' && flags.verdict === 'pass') {
    const missing = evidence(c).filter((r) => !r.ok);
    if (missing.length) need.push(`no evidence for ${missing.map((r) => r.id).join(', ')}: see the evidence command`);
  }
  if (stage === 'archive') need.push(...archiveProblems(c));
  if (stage === 'secure') need.push(...securityProblems(c.id));
  if (need.length) fail(`Cannot record ${stage}:\n${need.map((x) => '  - ' + x).join('\n')}`);
  if (stage === 'spec' || stage === 'mockup') {
    c.stages[stage] = { status: 'in_review' };
  } else if (stage === 'secure' && security(c.id).threats.some((t) => t.decision === 'accept')) {
    c.stages.secure = { status: 'in_review' };
  } else {
    const entry = { status: 'done', at: new Date().toISOString() };
    if (stage === 'secure') { entry.specHash = sha(read(changePath(c.id, 'spec.md'))); entry.fileHash = fileHash(c.id, 'security.md'); }
    if (stage === 'implement') entry.specHash = sha(read(changePath(c.id, 'spec.md')));
    if (stage === 'discover') {
      if (c.brief === 'brief.md' && read(changePath(c.id, 'brief.md')) === null) fail('brief.md is missing');
      if (flags.unconfirmed) entry.unconfirmed = true;
    }
    if (stage === 'discover' && c.source) {
      const src = read(c.source.path);
      if (src === null) fail(`The source requirements file ${c.source.path} is missing`);
      c.source.hash = sha(src);
    }
    if (stage === 'validate') {
      if (!['go', 'conditional', 'no-go'].includes(flags.verdict)) fail('validate needs --verdict go|conditional|no-go');
      entry.verdict = flags.verdict;
      entry.specHash = sha(read(changePath(c.id, 'spec.md')));
      const written = verdictIn(c.id, 'validation.md', 'no-go|conditional|go');
      if (written !== flags.verdict) fail(`validation.md ${written ? 'says "' + written + '"' : 'is missing or states no verdict'}, but you are recording "${flags.verdict}". The file and the state must agree.`);
      entry.fileHash = fileHash(c.id, 'validation.md');
    }
    if (stage === 'verify') {
      if (!['pass', 'fail'].includes(flags.verdict)) fail('verify needs --verdict pass|fail');
      entry.verdict = flags.verdict;
      const written = verdictIn(c.id, 'verify.md', 'pass|fail');
      if (written !== flags.verdict) fail(`verify.md ${written ? 'says "' + written + '"' : 'is missing or states no verdict'}, but you are recording "${flags.verdict}". The file and the state must agree.`);
      entry.fileHash = fileHash(c.id, 'verify.md');
      entry.state = codeState();
      if (flags.verdict === 'fail') { entry.status = 'failed'; c.stages.implement = { ...c.stages.implement, status: 'in_progress' }; }
    }
    if (flags.pr && flags.pr !== true) entry.pr = String(flags.pr);
    c.stages[stage] = entry;
  }
  saveChange(c);
  console.log(`${stage}: ${c.stages[stage].status}${c.stages[stage].verdict ? ` (${c.stages[stage].verdict})` : ''}`);
} else if (cmd === 'skip') {
  if (pos[1] !== 'mockup' || !flags.reason || flags.reason === true) fail('Usage: skip mockup [change] --reason "..."');
  const c = loadChange(resolveChange(pos[2]));
  requireBranch(c);
  c.ui = false;
  c.stages.mockup = { status: 'skipped', reason: flags.reason };
  saveChange(c);
  console.log(`Mockup skipped for ${c.id}`);
} else if (cmd === 'plan' || cmd === 'step') {
  const sub = cmd === 'step' ? pos[1] : 'list';
  const c = loadChange(resolveChange(cmd === 'step' ? (sub === 'done' ? pos[3] : pos[2]) : pos[1]));
  const steps = planSteps(read(changePath(c.id, 'spec.md')));
  if (!steps.length) fail('spec.md has no numbered steps under ## Plan');
  const stalePlan = Boolean(c.planHash && c.planHash !== planHash(c) && Object.keys(c.progress || {}).length);
  const progress = progressOf(c);
  if (sub === 'list') {
    if (stalePlan) console.log('The plan changed since steps were recorded: earlier progress no longer counts.');
    let phase = 0;
    for (const s of steps) {
      if (s.phase !== phase) { phase = s.phase; console.log(`Phase ${phase}${s.phaseName ? ': ' + s.phaseName : ''}`); }
      console.log(`  [${progress[s.id] ? 'x' : ' '}] ${s.id} ${s.title}${s.acs.length ? ' (' + s.acs.join(', ') + ')' : ''}${progress[s.id] ? ' - ' + progress[s.id].sha : ''}`);
    }
    console.log(`${steps.filter((s) => progress[s.id]).length}/${steps.length} steps done`);
  } else if (sub === 'next') {
    const next = steps.find((s) => !progress[s.id]);
    console.log(next ? `${next.id} ${next.title}${next.acs.length ? ' (' + next.acs.join(', ') + ')' : ''}` : 'All steps done');
  } else if (sub === 'done') {
    requireBranch(c);
    const b = blockers(c, 'implement');
    if (b.length) fail(`Gate closed for implement:\n${b.map((x) => '  - ' + x).join('\n')}`);
    const step = steps.find((s) => s.id === pos[2]);
    if (!step) fail(`No step "${pos[2]}". Steps: ${steps.map((s) => s.id).join(', ')}`);
    const earlier = steps.filter((s) => s.phase < step.phase && !progress[s.id]);
    if (earlier.length) fail(`Finish the earlier phase first: ${earlier.map((s) => s.id).join(', ')} still open`);
    const commit = flags.sha && flags.sha !== true ? String(flags.sha) : (git(['rev-parse', '--short', 'HEAD']) || '').trim();
    if (!commit) fail('No commit to record. Commit the step first.');
    c.progress = { ...progress, [step.id]: { sha: commit, at: new Date().toISOString() } };
    c.planHash = planHash(c);
    if (c.stages.implement.status === 'pending') c.stages.implement = { status: 'in_progress' };
    saveChange(c);
    const next = steps.find((s) => !c.progress[s.id]);
    console.log(`${step.id} done at ${commit}. ${next ? 'Next: ' + next.id + ' ' + next.title : 'All steps done: run-gate, then done implement'}`);
  } else fail('Usage: step next|done <id> [change] [--sha <sha>]');
} else if (cmd === 'run-gate') {
  const c = loadChange(resolveChange(pos[1]));
  requireBranch(c);
  const commands = gateCommands();
  if (!commands.length) fail('No validation.commands in .ai/agentic.config.json. List the commands CI runs (lint, typecheck, tests), in order.');
  // Continue an interrupted run when the code has not changed since its last recorded command.
  const prior = c.gate && !c.gate.complete && c.gate.state === codeState() ? c.gate.results.filter((r) => r.code === 0) : [];
  const results = [];
  for (const [i, command] of commands.entries()) {
    if (prior[i] && prior[i].command === command && results.length === i) {
      results.push(prior[i]);
      console.log(`PASS  ${command}  (recorded earlier for this code)`);
      continue;
    }
    console.log(`RUN   ${command}`);
    const started = Date.now();
    const r = spawnSync(command, { shell: true, stdio: 'inherit' });
    const code = r.status === null ? 1 : r.status;
    results.push({ command, code, seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${command}  (${results[results.length - 1].seconds}s)`);
    c.gate = { state: codeState(), at: new Date().toISOString(), results: [...results], complete: false };
    saveChange(c);
    if (code !== 0) break;
  }
  const green = results.length === commands.length && results.every((r) => r.code === 0);
  c.gate = { state: codeState(), at: new Date().toISOString(), results, complete: green };
  saveChange(c);
  if (!green) fail('Validation gate: FAILED. A failing command is a blocker, whoever broke it.');
  console.log('Validation gate: green, recorded for the current code');
} else if (cmd === 'diff-signals') {
  loadChange(resolveChange(pos[1]));
  const result = diffSignals();
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Diff against ${result.base}: ${result.files} file(s)`);
    for (const level of ['blocker', 'major', 'minor', 'info']) {
      for (const s of result.signals.filter((x) => x.severity === level)) {
        console.log(`[${level}] ${s.title}`);
        for (const w of s.where) console.log(`    ${w}`);
      }
    }
    console.log('Signals are leads. Confirm each one in the code before reporting it as a finding.');
  }
} else if (cmd === 'evidence') {
  const c = loadChange(resolveChange(pos[1]));
  const rows = evidence(c);
  console.log('| Criterion | Kind | Evidence | Status |\n|-----------|------|----------|--------|');
  for (const r of rows) console.log(`| ${r.id} | ${r.kind} | ${[...r.tests, ...r.screenshots.map((s) => 'screenshots/' + s)].join(', ') || '-'} | ${r.ok ? 'found' : 'MISSING'} |`);
  console.log(`Validation gate: ${gateGreen(c) ? 'green for the current code' : 'not green for the current code (run-gate)'}`);
  const missing = rows.filter((r) => !r.ok);
  if (missing.length) fail(`Missing evidence: ${missing.map((r) => r.id).join(', ')}. Behavior and security criteria need a test in this branch that names the id; ui criteria need screenshots/<AC-n>-*.png.`);
} else {
  console.log('Commands: init · new · status · gate · check · approve · done · skip · plan · step · run-gate · diff-signals · evidence');
  process.exit(cmd ? 1 : 0);
}
