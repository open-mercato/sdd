// Minimal lint: every source file must parse and must not contain console.log.
import fs from 'node:fs'; import path from 'node:path';
let bad = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk('src')) {
  const body = fs.readFileSync(f, 'utf8');
  if (/console\.log\(/.test(body)) { console.error(`${f}: console.log is not allowed in src/`); bad++; }
  try { await import(path.resolve(f)); } catch (e) { console.error(`${f}: ${e.message}`); bad++; }
}
process.exit(bad ? 1 : 0);
