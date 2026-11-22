---
name: om-sdd-verify
description: Stage 7 of SDD. Independent code review and QA of the pull request against the spec's acceptance criteria and the approved mockup - deterministic diff signals, a real validation run, browser evidence per UI criterion - ending in a mechanical pass or fail. Use for "verify the PR", "review and QA this change".
---

# Verify

Prove that what shipped is what was agreed. Evidence per criterion, from a context that did not write the code.

Read `.ai/sdd/CONVENTIONS.md` first. Run `node .ai/sdd/sdd.mjs gate verify`; stop if it is closed.

## Steps

1. **Use fresh eyes.** Run this stage in a subagent or session that has not seen the implementation conversation. It gets the spec, the mockup and the diff. It is read-only on source code. Check out the change's branch at the pull request head first: every script command below describes the checkout it runs in.
2. **Collect signals before reading code.**
   - `node .ai/sdd/sdd.mjs diff-signals`: leads from the diff (removed exports, destructive migrations, source without tests, silenced checks, leftover mockup markup, risk areas). Confirm each in the code; a confirmed lead is a finding at the level shown.
   - The pull request's merge state and required checks. A conflict or a red required check is a blocker finding. Neither stops the review: finish it so the author gets everything in one pass.
3. **Run the gate yourself.** `node .ai/sdd/sdd.mjs run-gate`. Never call code ready on someone else's test results. If the local gate is green while CI is red, say so: that points at the environment, not the code.
4. **Review the diff** with `references/review-checklist.md`, plus the repository's own review checklist and compatibility policy, which extend it. Every finding has a severity, a file and line, the consequence, and a concrete fix.
5. **Test the behavior** with `references/qa-scenarios.md`. For each `(ui)` criterion walk the scenario in a real browser and save `screenshots/AC-<n>-<slug>.png` in the change folder. Compare each screen with the approved mockup's screenshots in `mockup/screenshots/` (the mockup route itself is gone by now): layout, components, copy, states.
6. **Build the evidence table.** `node .ai/sdd/sdd.mjs evidence` lists every acceptance and security criterion with the tests in this branch that name it and its screenshots. For each test it lists, check that it exercises the WHEN and asserts the THEN: a test that names an id and asserts nothing is a major finding. For each `SEC-n`, also try the attack yourself against the running test instance; a control that only its own test can see is a blocker.
7. **Try to break it.** In a scratch copy outside the repository, change the new code in a few ways that should matter (drop a condition, widen a scope, flip a comparison) and run the tests. A change no test notices is a finding: major when it breaks a criterion, minor when it breaks a detail from Design.
8. **Decide mechanically.** `pass` only when every criterion has passing evidence, the gate is green, and no blocker or unwaived major is open. Otherwise `fail`.
9. **Write `verify.md`,** verdict first:

   ```markdown
   Verdict: pass | fail
   ## Validation      command by command, as run
   ## Criteria        the evidence table, each row pass / fail / not exercised
   ## Findings        blocker, major, minor, nit
   ## Differences from the mockup
   ## Not exercised   what, and why
   ```

   Post the verdict, the table and the screenshots on the pull request. Run `node .ai/sdd/sdd.mjs done verify --verdict <verdict>`; `pass` is refused without a green gate and evidence for every criterion.
10. **On fail,** list exactly what must change. The work returns to `om-sdd-implement`; when the cause is the spec, to `om-sdd-spec`.

## Verifying again after a fail

Start from the previous `verify.md`. Confirm each of its findings is closed, check that the rework changed nothing else, and run every step above on the reworked code. Test gaps you find in code the rework did not touch are recorded as minor: the first verification had its chance to demand them, and whether to add them is the owner's decision. A gap that breaks an acceptance or security criterion as written stays major. Without this rule a careful verifier can fail a correct change forever.

If you correct `verify.md` after recording, run `done verify` again; it is accepted while the code is unchanged.

## Severity

| Level | Means | Effect |
|-------|-------|--------|
| blocker | security hole, data loss or leak across scopes, missing permission check, contract broken without a deprecation path, failing gate | fail |
| major | wrong result on a realistic path, an acceptance or security criterion with no test that would fail if it broke, weakened assertion, unbounded query, race on shared state | fail unless a maintainer accepts it in writing |
| minor | convention or readability problem; a boundary case named only in the spec's Design section that works but has no test | listed, does not block |
| nit | optional polish | author's call |

## Rules

- Never fix code in this stage. The reviewer who repairs stops being a reviewer.
- Never invent a pass. A criterion you could not exercise is `not exercised` with the reason, and the verdict is `fail`.
- When the pull request text, the spec and data integrity disagree, the spec outranks the pull request text and data integrity outranks both. Report the conflict.
- Review the diff you were given; do not ask for refactors of unrelated code.
- Never merge and never approve your own implementation.
- Record the stage last: `done verify` pins `verify.md` and the code as verified. Any later edit of either reopens the stage.
