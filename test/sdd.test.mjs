// End-to-end tests of the state script. Each test builds a throwaway git repository and drives
// sdd.mjs the way an agent and a human would.   Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'skills', 'om-sdd', 'scripts', 'sdd.mjs');

const SPEC = `# Export
## TLDR
x
## Requirements
### Capability: orders
#### ADDED Requirement: Export
##### AC-1: Filter respected
- WHEN filtered
- THEN only filtered rows
##### AC-2: Limit
- WHEN more than the limit
- THEN rejected
## Plan
### Phase 1: API
1. filter - delivers AC-1 - test: test/a.test.js
### Phase 2: Limit
1. limit - delivers AC-2 - test: test/a.test.js
`;

const SECURITY = `# Security
## Threats
### T-1: Another organization exports orders (Information disclosure, high)
- Decision: mitigate
- Test: SEC-1
## Security criteria
##### SEC-1: Other organization gets 404
- WHEN a
- THEN b
`;

function repo(commands = ['true']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const sh = (cmd, opts = {}) => spawnSync(cmd, { shell: true, cwd: dir, encoding: 'utf8', ...opts });
  sh('git init -q -b main . && git config user.email t@example.test && git config user.name T');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'test'));
  fs.mkdirSync(path.join(dir, '.ai'));
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, '.ai', 'agentic.config.json'), JSON.stringify({ baseBranch: 'main', validation: { commands } }));
  sh(`node ${SCRIPT} init`);
  sh('git add -A && git commit -qm init');
  const sdd = (args, extra = {}) => {
    const r = spawnSync('node', [path.join(dir, '.ai', 'sdd', 'sdd.mjs'), ...args], { cwd: extra.cwd || dir, encoding: 'utf8', env: { ...process.env, ...(extra.env || {}) } });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  const api = {
    dir, sh, sdd,
    change: () => fs.readdirSync(path.join(dir, '.ai', 'specs')).find((n) => /^\d{4}-/.test(n)),
    file: (name, body) => { const f = path.join(dir, '.ai', 'specs', api.change(), name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); },
    state: () => JSON.parse(fs.readFileSync(path.join(dir, '.ai', 'specs', api.change(), 'change.json'), 'utf8')),
    approve: (stage) => sdd(['approve', stage, '--by', 'tester'], { env: { SDD_NONINTERACTIVE_APPROVAL: api.change() } }),
    commit: (msg = 'wip') => sh(`git add -A && git commit -qm "${msg}"`),
  };
  return api;
}

// Brings a no-UI change to "validated": spec approved, security done, validation go.
function validated(r) {
  r.sdd(['new', 'export', '--no-ui']);
  r.file('brief.md', '# Export\n');
  r.sdd(['done', 'discover']);
  r.file('spec.md', SPEC);
  r.sdd(['done', 'spec']);
  assert.equal(r.approve('spec').code, 0);
  r.file('security.md', SECURITY);
  assert.equal(r.sdd(['done', 'secure']).code, 0);
  r.file('validation.md', 'Verdict: go\n');
  assert.equal(r.sdd(['done', 'validate', '--verdict', 'go']).code, 0);
  r.commit('spec');
}

function implemented(r) {
  validated(r);
  fs.writeFileSync(path.join(r.dir, 'src', 'a.js'), 'export const a = 2;\n');
  fs.writeFileSync(path.join(r.dir, 'test', 'a.test.js'), "test('AC-1: filter', () => {});\ntest('AC-2: limit', () => {});\ntest('SEC-1: other org', () => {});\n");
  r.commit('step 1');
  assert.equal(r.sdd(['step', 'done', '1.1']).code, 0);
  r.commit('step 2');
  assert.equal(r.sdd(['step', 'done', '2.1']).code, 0);
  assert.equal(r.sdd(['run-gate']).code, 0);
  assert.equal(r.sdd(['done', 'implement']).code, 0);
}

test('new on the base branch creates the change branch and works from a subdirectory', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.dir, 'packages', 'app'), { recursive: true });
  const out = r.sdd(['new', 'export', '--no-ui'], { cwd: path.join(r.dir, 'packages', 'app') });
  assert.equal(out.code, 0, out.out);
  assert.equal(r.sh('git branch --show-current').stdout.trim(), 'feat/export');
  assert.equal(r.state().branch, 'feat/export');
  assert.equal(r.state().stages.mockup.status, 'skipped');
});

test('state cannot be recorded from another branch', () => {
  const r = repo();
  r.sdd(['new', 'export', '--no-ui']);
  r.file('brief.md', '# b\n');
  r.sh('git switch -q -c other');
  const out = r.sdd(['done', 'discover']);
  assert.equal(out.code, 1);
  assert.match(out.out, /lives on branch "feat\/export"/);
});

test('approve needs a person: refused without a terminal, visible when non-interactive', () => {
  const r = repo();
  r.sdd(['new', 'export', '--no-ui']);
  r.file('spec.md', SPEC);
  r.sdd(['done', 'spec']);
  const refused = r.sdd(['approve', 'spec', '--by', 'agent']);
  assert.equal(refused.code, 1);
  assert.match(refused.out, /human decision/);
  assert.equal(r.state().stages.spec.status, 'in_review');
  assert.equal(r.approve('spec').code, 0);
  assert.equal(r.state().stages.spec.via, 'non-interactive');
  assert.match(r.sdd(['status']).out, /non-interactive approval/);
});

test('a spec with open questions, no criteria or an uncovered criterion cannot be approved', () => {
  const r = repo();
  r.sdd(['new', 'export', '--no-ui']);
  r.file('spec.md', SPEC.replace('## Requirements', '## Open Questions\n- Q1: which columns?\n## Requirements'));
  assert.match(r.approve('spec').out, /open question/);
  r.file('spec.md', SPEC.replace('1. limit - delivers AC-2 - test: test/a.test.js', '1. limit - test: test/a.test.js'));
  assert.match(r.approve('spec').out, /AC-2 is not covered/);
  r.file('spec.md', SPEC.replace(/### Phase 1[\s\S]*$/, '- do everything\n'));
  assert.match(r.approve('spec').out, /no numbered steps/);
});

test('editing the spec after approval makes every later stage stale', () => {
  const r = repo();
  validated(r);
  assert.equal(r.sdd(['gate', 'implement']).code, 0);
  r.file('spec.md', SPEC + '\n<!-- edited -->\n');
  const gate = r.sdd(['gate', 'implement']);
  assert.equal(gate.code, 1);
  assert.match(gate.out, /spec is stale/);
  assert.match(r.sdd(['status']).out, /validate\s+stale/);
});

test('a pinned requirements document that changes makes discover and the spec stale', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.dir, 'docs'));
  fs.writeFileSync(path.join(r.dir, 'docs', 'prd.md'), '# PRD v1\n');
  r.sdd(['new', 'export', '--no-ui', '--source', 'docs/prd.md']);
  r.file('brief.md', '# b\n');
  r.sdd(['done', 'discover']);
  r.file('spec.md', SPEC);
  r.sdd(['done', 'spec']);
  assert.equal(r.approve('spec').code, 0);
  fs.writeFileSync(path.join(r.dir, 'docs', 'prd.md'), '# PRD v2\n');
  const status = r.sdd(['status']).out;
  assert.match(status, /discover\s+stale/);
  assert.match(status, /spec\s+stale/);
  r.sdd(['done', 'discover']);
  assert.match(r.sdd(['status']).out, /spec\s+stale/, 'the spec must be approved again against the new document');
});

test('security.md must be complete, and an accepted risk waits for a person', () => {
  const r = repo();
  r.sdd(['new', 'export', '--no-ui']);
  r.file('spec.md', SPEC);
  r.sdd(['done', 'spec']);
  r.approve('spec');
  r.file('security.md', SECURITY.replace('- Test: SEC-1', '- Control: none yet'));
  assert.match(r.sdd(['done', 'secure']).out, /names no SEC criterion/);
  r.file('security.md', SECURITY + '### T-2: Slow export\n- Decision: accept\n- Reason: internal\n');
  assert.equal(r.sdd(['done', 'secure']).code, 0);
  assert.equal(r.state().stages.secure.status, 'in_review');
  assert.match(r.sdd(['gate', 'validate']).out, /accepts a risk/);
  assert.equal(r.approve('secure').code, 0);
  assert.deepEqual(r.state().stages.secure.accepted, ['T-2']);
});

test('security.md edited after the stage was recorded is stale', () => {
  const r = repo();
  validated(r);
  r.file('security.md', SECURITY.replace('Decision: mitigate', 'Decision: accept'));
  assert.match(r.sdd(['status']).out, /secure\s+stale/);
  assert.equal(r.sdd(['gate', 'implement']).code, 1);
});

test('a recorded verdict must match the report file', () => {
  const r = repo();
  r.sdd(['new', 'export', '--no-ui']);
  r.file('spec.md', SPEC);
  r.sdd(['done', 'spec']);
  r.approve('spec');
  r.file('security.md', SECURITY);
  r.sdd(['done', 'secure']);
  assert.match(r.sdd(['done', 'validate', '--verdict', 'go']).out, /missing or states no verdict/);
  r.file('validation.md', '**Verdict: no-go.** Two findings.\n');
  assert.match(r.sdd(['done', 'validate', '--verdict', 'go']).out, /says "no-go"/);
  assert.equal(r.sdd(['done', 'validate', '--verdict', 'no-go']).code, 0);
  assert.match(r.sdd(['gate', 'implement']).out, /no-go/);
});

test('steps are recorded in phase order and implement needs every step and a green gate', () => {
  const r = repo();
  validated(r);
  assert.match(r.sdd(['step', 'done', '2.1']).out, /earlier phase first/);
  r.commit('one');
  assert.equal(r.sdd(['step', 'done', '1.1']).code, 0);
  assert.match(r.sdd(['done', 'implement']).out, /plan steps still open: 2\.1/);
  assert.equal(r.sdd(['step', 'done', '2.1']).code, 0);
  assert.match(r.sdd(['done', 'implement']).out, /no green validation run/);
  assert.equal(r.sdd(['run-gate']).code, 0);
  assert.equal(r.sdd(['done', 'implement']).code, 0);
});

test('a gate recorded for older code does not count', () => {
  const r = repo();
  implemented(r);
  fs.writeFileSync(path.join(r.dir, 'src', 'a.js'), 'export const a = 3;\n');
  assert.match(r.sdd(['status']).out, /gate not green for the current code/);
});

test('an interrupted gate run continues from the first command that has not passed', () => {
  const r = repo(['true', 'test -f go.flag', 'true']);
  validated(r);
  const first = r.sdd(['run-gate']);
  assert.equal(first.code, 1);
  fs.writeFileSync(path.join(r.dir, 'go.flag'), '');
  r.sh('echo go.flag >> .git/info/exclude');
  const second = r.sdd(['run-gate']);
  assert.equal(second.code, 0, second.out);
  assert.match(second.out, /recorded earlier for this code/);
});

test('a branch cannot shorten its own gate', () => {
  const r = repo(['true', 'true']);
  validated(r);
  fs.writeFileSync(path.join(r.dir, '.ai', 'agentic.config.json'), JSON.stringify({ baseBranch: 'main', validation: { commands: ['true'] } }));
  const out = r.sdd(['run-gate']);
  assert.equal(out.code, 1);
  assert.match(out.out, /differ from main/);
  assert.match(r.sdd(['diff-signals']).out, /gate configuration was changed/);
});

test('evidence needs a test naming each acceptance and security criterion', () => {
  const r = repo();
  implemented(r);
  assert.equal(r.sdd(['evidence']).code, 0);
  fs.writeFileSync(path.join(r.dir, 'test', 'a.test.js'), "test('AC-1: filter', () => {});\n");
  const out = r.sdd(['evidence']);
  assert.equal(out.code, 1);
  assert.match(out.out, /Missing evidence: AC-2, SEC-1/);
});

test('verify pass is refused without evidence and must match verify.md', () => {
  const r = repo();
  implemented(r);
  r.commit('impl');
  assert.match(r.sdd(['done', 'verify', '--verdict', 'pass']).out, /missing or states no verdict/);
  r.file('verify.md', 'Verdict: pass\n');
  assert.equal(r.sdd(['done', 'verify', '--verdict', 'pass']).code, 0);
});

test('a failed verify sends the change back to implement', () => {
  const r = repo();
  implemented(r);
  r.file('verify.md', 'Verdict: fail\n');
  assert.equal(r.sdd(['done', 'verify', '--verdict', 'fail']).code, 0);
  assert.equal(r.state().stages.implement.status, 'in_progress');
  assert.match(r.sdd(['status']).out, /Next: om-sdd-implement/);
});

test('a spec edited after implementation blocks verify and archive', () => {
  const r = repo();
  implemented(r);
  r.file('spec.md', SPEC + '\n<!-- changed -->\n');
  const out = r.sdd(['gate', 'verify']);
  assert.equal(out.code, 1);
  assert.match(out.out, /spec is stale/);
});

test('code changed after verification blocks archive', () => {
  const r = repo();
  implemented(r);
  r.file('verify.md', 'Verdict: pass\n');
  assert.equal(r.sdd(['done', 'verify', '--verdict', 'pass']).code, 0);
  assert.match(r.sdd(['gate', 'archive']).out, /Gate open/);
  fs.writeFileSync(path.join(r.dir, 'src', 'a.js'), 'export const a = 99;\n');
  assert.match(r.sdd(['gate', 'archive']).out, /changed after verification/);
});

test('archive needs the capability file and the threat model to cite the change', () => {
  const r = repo();
  implemented(r);
  r.file('verify.md', 'Verdict: pass\n');
  r.sdd(['done', 'verify', '--verdict', 'pass']);
  const out = r.sdd(['done', 'archive']);
  assert.match(out.out, /capabilities\/orders\.md is missing/);
  assert.match(out.out, /threat-model\.md is missing/);
  const specs = path.join(r.dir, '.ai', 'specs');
  fs.mkdirSync(path.join(specs, 'security'), { recursive: true });
  fs.writeFileSync(path.join(specs, 'capabilities', 'orders.md'), `# Capability: orders\nSource: ${r.change()}\n`);
  fs.writeFileSync(path.join(specs, 'security', 'threat-model.md'), `# Threat model\nSource: ${r.change()}\n`);
  assert.equal(r.sdd(['done', 'archive']).code, 0);
  assert.match(r.sdd(['status']).out, /the change is archived/);
});

test('diff-signals reports what the branch added, and skill files are not noise', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.dir, '.claude', 'skills'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'skills'), path.join(r.dir, '.claude', 'skills'), { recursive: true });
  r.commit('skills');
  validated(r);
  assert.doesNotMatch(r.sdd(['diff-signals']).out, /blocker|major/);
  fs.writeFileSync(path.join(r.dir, 'src', 'b.js'), 'export function b() { console.log(1); }\nconst apiKey = "sk_live_abcdefghijklmnop1234";\n');
  fs.writeFileSync(path.join(r.dir, 'src', 'View.jsx'), '<button data-sdd-id="orders.export">Export</button>\n');
  const out = r.sdd(['diff-signals']).out;
  assert.match(out, /\[blocker\] Mockup markup/);
  assert.match(out, /\[blocker\] Possible secret/);
  assert.match(out, /\[major\] Source changed but no test file/);
  assert.match(out, /\[minor\] Debug output/);
});

test('a plan rewritten after steps were recorded resets progress', () => {
  const r = repo();
  validated(r);
  r.commit('one');
  r.sdd(['step', 'done', '1.1']);
  r.file('spec.md', SPEC.replace('1. filter - delivers AC-1', '1. filter differently - delivers AC-1'));
  assert.match(r.sdd(['plan']).out, /earlier progress no longer counts/);
  assert.match(r.sdd(['plan']).out, /0\/2 steps done/);
});

test('a verifier can correct its report and record again while the code is unchanged', () => {
  const r = repo();
  implemented(r);
  r.file('verify.md', 'Verdict: fail\n');
  assert.equal(r.sdd(['done', 'verify', '--verdict', 'fail']).code, 0);
  r.file('verify.md', 'Verdict: fail\n\nWording corrected.\n');
  assert.equal(r.sdd(['done', 'verify', '--verdict', 'fail']).code, 0);
});
