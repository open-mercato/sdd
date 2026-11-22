# Review checklist

Apply every section the diff touches. The repository's own checklist and compatibility policy add to this; they never replace it. Separate a design or scope question (a decision for the owner) from a defect (a finding).

## Contracts (blocker)
- Nothing public is removed, renamed or narrowed silently: exports, routes and response shapes, event names, CLI flags, config keys, columns. Deprecate first, keep a working bridge, remove later.
- Data changes are additive: new optional fields and columns with defaults. Renaming, removing or retyping is breaking.
- For every changed event, shared type or extension point, find the current consumers and check they still work. Say what you searched when you claim there are none.

## Security (blocker)
- Every input is validated with a schema at the trust boundary.
- Every endpoint and handler checks authentication and permission on the server, for the specific record, not only the role. A check in the UI is not a check.
- Every query on scoped data filters by its owner (user, organization, tenant). Lists, exports and search are where leaks hide.
- Untrusted input is never concatenated into a query, a shell command or a file path.
- No secret is committed, logged or returned. Auth errors do not reveal whether an account exists.

## Data integrity (blocker or major)
- Read each migration's statements, not its filename. Flag anything beyond the intended change: unrelated tables, mass constraint drops, drift from a local database.
- A schema change ships with its migration.
- Multi-step writes are atomic. Anything that can run twice (queue consumers, webhooks, retries) is idempotent.

## Tests (major)
- Each behavior change has a test that fails without the change. Each bug fix has a regression test.
- Risk areas have a test at the boundary: permission denied and the wrong-scope read; failure, retry and repeat for money; up and down for a migration; the consuming side of a shared contract.
- Name the exact missing cases. A skipped test needs a written reason.

## Failure and performance (major)
- Errors are handled where they occur and surface to the user in a usable way. Nothing is swallowed.
- No query grows without a bound or runs once per row. Lists are paginated.
- Shared state has no unresolved race. Cache keys are scoped and invalidated on every write path.

## UI (major or minor)
- Loading, empty and error states exist. Keyboard access works. User-facing text goes through localization when the project has it.
- The project's own components and helpers are used, not hand-made substitutes.
- No route moved from server to client rendering without a stated reason. No global provider imports something one screen needs.

## Scope and hygiene (minor)
- Nothing in the diff is outside the spec. No drive-by refactor, no unrelated formatting.
- New dependencies are necessary, maintained and licensed compatibly; the lockfile matches.
- Generated files are regenerated, never hand-edited.
