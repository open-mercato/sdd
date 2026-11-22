---
name: om-sdd-validate
description: Stage 5 of SDD. Read-only readiness check before any code is written - traceability, the spec's claims against the real codebase, backward compatibility, mockup alignment, security controls - ending in a mechanical go, conditional or no-go verdict. Use for "is this ready to build", "validate the spec".
---

# Validate

Catch the problem before it costs an implementation. This stage writes one file, `validation.md`, and changes nothing else.

Read `.ai/sdd/CONVENTIONS.md` first. Run `node .ai/sdd/sdd.mjs gate validate`; stop if it is closed.

## Steps

1. **Run the deterministic check.** `node .ai/sdd/sdd.mjs check`. Every line it prints is a Critical finding.
2. **Ground the spec in the code.** For each module, route, event, entity, permission and config key the spec names, find it. Search; do not trust the spec's description. A spec that mis-describes the codebase is Critical. Say what you searched whenever you claim something does not exist.
3. **Check for unpinned behavior changes.** For every requirement, ask whether a request that succeeds today will be rejected or answered differently. If so and the requirement has no `Frozen by:` with a characterization step first in its phase, that is a Warning.
4. **Check compatibility.** Compare every plan step with every protected surface in `BACKWARD_COMPATIBILITY.md` when the repository has one. A break with no migration path is Critical. A break that needs a deprecation bridge the spec does not name is a Warning.
5. **Check the rules.** Compare the design with the repository's agent instructions and review checklist. Each violation cites the rule it breaks.
6. **Check the mockup against the spec.** For a UI change: every screen and state in the approved mockup traces to a criterion, and nothing the mockup shows contradicts a requirement.
7. **Check the security controls.** For every threat in `security.md` marked `mitigate`: the named control exists in the code, or the plan has a step that builds it, and its `SEC-n` criterion can be tested at the level described. A control that is neither present nor planned is Critical.
8. **Decide mechanically.**
   - `no-go`: any Critical finding.
   - `conditional`: no Critical, but Warnings or unmitigated High risks. Implementation may start with the listed items added to the plan.
   - `go`: everything else.
9. **Write `validation.md`:** the line `Verdict: <go|conditional|no-go>` first, then findings (severity, evidence, concrete fix), then what was not checked. Run `node .ai/sdd/sdd.mjs done validate --verdict <verdict>`.

## Rules

- Read-only. Proposed spec edits go in the report; the author applies them with `om-sdd-spec`.
- A product or scope question is reported as a decision for the owner, never as a defect.
- Do not soften the verdict. `no-go` sends the change back to the spec.
