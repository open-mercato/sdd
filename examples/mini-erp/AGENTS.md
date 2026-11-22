# mini-erp: instructions for coding agents

A small ERP core: companies and sales orders, multi-tenant by organization. Plain Node.js ES modules, no dependencies.

## Rules

- Every read and write of tenant data goes through `scoped(table, ctx.organizationId)` in `src/lib/store.js`. Never touch a table without it.
- Every service entry point starts with `requireFeature(ctx, '<feature>')`. New capabilities get a new feature in `src/lib/acl.js`.
- Validation failures throw `FieldError(field, code, message)`. A record of another organization is `NotFoundError`, never a different message that reveals it exists.
- Routes in `src/routes.js` are thin: one service call each. Business rules live in services.
- Public surface: the exported functions of the service modules, the route keys, the `FEATURES` keys and error `code` values. Do not remove or rename them.
- Tests live in `test/` and run with `npm test` (Node's built-in runner). Every behavior change comes with a test.
- No `console.log` in `src/`.

## Workflow

Feature work goes through the om-sdd skills in `.claude/skills/` (entry point: `om-sdd`). State and gates are handled by `node .ai/sdd/sdd.mjs`.
