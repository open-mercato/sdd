// In-memory tables. Every read and write goes through scoped(), which filters by organization.
let seq = 0;
const tables = new Map();

export function reset() { tables.clear(); seq = 0; }
function table(name) { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); }

export function scoped(name, organizationId) {
  if (!organizationId) throw new Error('organizationId is required');
  const t = table(name);
  return {
    list: (predicate = () => true) => [...t.values()].filter((r) => r.organizationId === organizationId && predicate(r)).map((r) => ({ ...r })),
    get: (id) => { const r = t.get(id); return r && r.organizationId === organizationId ? { ...r } : null; },
    insert: (data) => { const row = { ...data, id: `${name}_${++seq}`, organizationId }; t.set(row.id, row); return { ...row }; },
    update: (id, patch) => {
      const r = t.get(id);
      if (!r || r.organizationId !== organizationId) return null;
      const next = { ...r, ...patch, id: r.id, organizationId: r.organizationId };
      t.set(id, next); return { ...next };
    },
  };
}
