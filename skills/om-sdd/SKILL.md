---
name: om-sdd
description: Entry point for spec-driven development. Sets up SDD in a repository, starts a change, shows where a change stands and which stage runs next. Use for "start a change", "sdd status", "what's next", or when unsure which om-sdd-* skill applies.
---

# SDD

Eight stages, one change folder, one state file. This skill sets things up and routes; the stage skills do the work.

## Steps

1. **Set up once per repository.** When `.ai/sdd/sdd.mjs` is missing, run `node <this skill>/scripts/sdd.mjs init`. It vendors the state script and `CONVENTIONS.md` into `.ai/sdd/` so every stage skill and every teammate uses the same copy. Commit both.
2. **Read `.ai/sdd/CONVENTIONS.md`.**
3. **Start or find the change.**
   - New work: `node .ai/sdd/sdd.mjs new <slug> --title "<title>"`. Run on the base branch, it creates the change's branch `feat/<slug>`; every later stage works and commits there. Add `--no-ui` when nothing a person sees changes. Add `--brief <path>` when the change is another slice of an initiative that already has a brief. Add `--source <path>` when requirements already exist as a document in the repository.
   - Existing work: `node .ai/sdd/sdd.mjs status [change]`.
4. **Route.** Run the skill named on the `Next:` line. When the line says `blocked`, relay the blockers and stop. When a stage waits for human approval, give the user the exact command: `node .ai/sdd/sdd.mjs approve spec|mockup|secure --by <name>`.

## Rules

- Never skip a stage. The only stage that may be skipped is the mockup, with `skip mockup --reason "..."`, for a change with no user interface.
- Never run `approve` yourself, and never set anything that makes it run without a person. It records a human decision; give the owner the command and stop.
