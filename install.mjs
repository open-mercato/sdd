#!/usr/bin/env node
// Installs the om-sdd skills into a repository and sets up its state folder.
//
//   node install.mjs <path to repository> [--skills-dir .claude/skills]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirFlag = args.indexOf('--skills-dir');
const skillsDir = dirFlag >= 0 ? args[dirFlag + 1] : '.claude/skills';
const target = args.find((a, i) => !a.startsWith('--') && (dirFlag < 0 || i !== dirFlag + 1));

if (!target || !fs.existsSync(path.join(target, '.git'))) {
  console.error('Usage: node install.mjs <path to a git repository> [--skills-dir .claude/skills]');
  process.exit(1);
}

const dest = path.join(target, skillsDir);
fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(path.join(here, 'skills'))) {
  fs.rmSync(path.join(dest, name), { recursive: true, force: true });
  fs.cpSync(path.join(here, 'skills', name), path.join(dest, name), { recursive: true });
}

const config = path.join(target, '.ai', 'agentic.config.json');
let needsCommands = false;
if (!fs.existsSync(config)) {
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ baseBranch: 'main', validation: { commands: [] } }, null, 2) + '\n');
  needsCommands = true;
} else {
  try { needsCommands = !((JSON.parse(fs.readFileSync(config, 'utf8')).validation || {}).commands || []).length; } catch { needsCommands = true; }
}

const init = spawnSync('node', [path.join(dest, 'om-sdd', 'scripts', 'sdd.mjs'), 'init'], { cwd: target, encoding: 'utf8' });
if (init.status !== 0) { console.error(init.stdout + init.stderr); process.exit(1); }

console.log(`Skills installed in ${path.join(target, skillsDir)}`);
console.log('State script and conventions vendored in .ai/sdd/');
if (needsCommands) console.log('Next: list the commands CI runs in .ai/agentic.config.json under validation.commands. Implementation cannot be recorded without them.');
console.log('Commit .ai/ and the skills on your base branch, then start with the om-sdd skill.');
