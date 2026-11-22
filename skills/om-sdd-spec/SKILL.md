---
name: om-sdd-spec
description: Stage 2 of SDD. Writes one spec that contains its own implementation plan - behavior as numbered acceptance criteria, design decisions, and phased steps. Skeleton first with a hard open-questions gate. Use for "write the spec", "spec this", or to revise a spec after mockup feedback.
---

# Spec + plan

One document holds what the change does and how it will be built. There is no separate plan.

Read `.ai/sdd/CONVENTIONS.md` first. Arguments: `--auto` for unattended runs.

## Steps

1. **Load context.** The brief named in `change.json`, the repository's agent instructions, the code of the affected area, and the capability files the change touches. The code describes current behavior; older specs do not. Stop reading once you can name the modules and contracts involved.
2. **Skeleton first.** Write `spec.md` with TLDR, Problem and an `## Open Questions` block: every decision that would force a rewrite if guessed wrong, one per line, answerable in a word or a choice. Include the brief's open questions and unconfirmed assumptions, and the scope itself when `status` shows it unconfirmed, so the owner answers everything in one round. Always ask whether a change that bundles two independently deployable capabilities should be split.
3. **Stop for answers.** Do not design until the user has answered. Move each answered question out of `## Open Questions` into `## Decisions`, with the answer and who gave it; an empty list reads `- None`. With `--auto`, choose the most reversible, smallest-scope answer for each question, record it under `## Resolved assumptions`, and mark any that touch security, data scoping or a public contract `NEEDS HUMAN CONFIRMATION`.
4. **Fill in the spec** from `references/spec-template.md`. Omit sections that would be empty.
   - Behavior goes in `## Requirements` as ADDED, MODIFIED or REMOVED requirements. Each has at least one acceptance criterion in the `AC-n` format.
   - Design covers only what is unique to this change. Do not re-document the framework or standard CRUD.
   - Length follows the change. A rule inside one service is about a page; no section restates the request or the brief.
   - A new rule on an existing operation changes behavior even when the requirement itself is new. Whenever a request that succeeds today will be rejected or answered differently, the requirement carries `Frozen by:` and its phase starts with a characterization step.
5. **Write the plan.** Phases that ship independently, steps that each leave the application working. Every step names the `AC-n` it delivers and the test that proves it. A MODIFIED or REMOVED requirement starts its phase with a characterization step: a test that pins today's behavior, committed before the change.
6. **Review your own work through someone else.** Give a fresh-context subagent only the spec path. Ask for findings ranked Critical, High, Medium, Low on: scope cohesion, invented substitutes for existing project primitives, unflagged breaking changes, missing failure behavior, steps that cannot be tested. Fix Critical and High.
7. **Hand over.** Run `node .ai/sdd/sdd.mjs check`, fix what it reports about the spec, then `done spec`. Tell the user to read the spec and run `approve spec`.

## Revising after mockup feedback

Edit the affected requirements, criteria and plan steps in place. Keep existing `AC-n` ids; new criteria take new ids. The edit makes the earlier approval stale by design: the user approves again.

## Rules

- Never answer your own open questions in an interactive run.
- Never edit code while writing a spec.
- A criterion that cannot be observed by a user, caller or operator is design detail, not a criterion.
