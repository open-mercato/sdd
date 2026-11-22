---
name: om-sdd-implement
description: Stage 6 of SDD. Implements an approved, validated spec step by step on its own branch and pull request - resumable, with a test per acceptance criterion, the approved mockup as the UI reference, and a recorded green validation run. Use for "implement the spec", "build it", "continue the implementation".
---

# Implement

Build exactly what was agreed: the spec says what, the plan says in which order, the mockup says how it looks.

Read `.ai/sdd/CONVENTIONS.md` first. Run `node .ai/sdd/sdd.mjs gate implement`; stop if it is closed. Arguments: `--auto` runs without stopping between phases.

## Steps

1. **Start or resume.** Work on the change's own branch, the one that already holds its brief and spec (`status` names it); never create a second branch. `node .ai/sdd/sdd.mjs plan` shows what is done. If a pull request for this branch exists, continue it; never open a second one. When the main checkout is in use, add a worktree of the same branch and remove the worktree you created when you finish.
2. **Make the work visible early.** After the first commit, push and open a **draft** pull request whose body links `spec.md`, `validation.md` and the mockup. An interrupted run leaves a draft someone can watch and resume, never a branch nobody knows about.
3. **Carry conditions over.** When `validation.md` says `conditional`, do its listed items before the first step.
4. **Work one step at a time.** `node .ai/sdd/sdd.mjs step next` names it. Do not pull work forward from a later phase.
   - A characterization step comes first in its phase: write the test against unchanged code, see it pass, commit it alone.
   - Write or update the test the step names, with the criterion id in the test name (`AC-3: export respects the active filter`). Unit tests for every behavior change. Risk areas also need a test at the boundary: permission denied and the wrong-scope read for access; failure, retry and repeat for money; up and down for a migration; the consuming side for a shared contract.
   - Implement the smallest change that passes. Reuse existing primitives. Generate migrations with the project's tooling and read the generated statements: only the expected change may be in them.
   - Run the validation commands relevant to what changed. Re-read your diff and remove anything the step did not ask for.
   - Commit with a conventional-commit subject, then `node .ai/sdd/sdd.mjs step done <id>`. Push at the end of each phase.
5. **Build the security controls.** For every `SEC-n` in `security.md`, write a test named with the id that performs the attack and asserts the required outcome, then make it pass. These tests are part of the change, not an afterthought: verification will not pass without them.
6. **Build UI from the mockup.** The approved mockup is the reference for layout, components, copy and states. Use the same components. Move what is reusable out of the mockup route and delete the route; no `data-sdd-*` attribute and no review script may remain in application code.
7. **Stop on drift.** If a step cannot be built as specified, or building it would change behavior the spec describes, stop. Report what differs; the fix is a spec revision through `om-sdd-spec`.
8. **Run the full gate.** `node .ai/sdd/sdd.mjs run-gate` runs every validation command and records the result for the current code. If it outlasts your command timeout, run it again: it continues from the first command that has not passed. Never run the commands by hand instead and call that green, and never edit `validation.commands`. A failing command blocks you even when the cause predates your branch: you never record done on a red gate. Fix it yourself only when the fix lies inside this change's spec. When it needs a behavior change elsewhere, stop and give the owner the options (fix on the base branch as its own change, or widen this spec); scope outranks speed.
9. **Finish.** `node .ai/sdd/sdd.mjs done implement --pr <number>`; it refuses while steps are open, the gate is not green for the current code, or mockup markup remains. Update the pull request body (what changed for whom, each `AC-n` with its test, anything not done) and mark it ready. With `--auto`, a pull request that depends on an assumption marked `NEEDS HUMAN CONFIRMATION` stays a draft.

## After a failed verify

Fix each finding as a new commit on the same branch, never by rewriting history. Run the gate again and record `done implement` again.

## Rules

- No scope beyond the spec. Improvements you notice become a note in the pull request, not code.
- Never delete, skip or loosen a test, and never silence a check, to get green.
- Do not wait for CI before reporting. Say which checks are still running.
- A documentation-only change needs no new tests; it still runs the gate.
- The pull request is the deliverable. Merging is a human decision.
