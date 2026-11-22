---
name: om-sdd-archive
description: Stage 8 of SDD. After verification passes, folds the change's requirements into the living capability specs so they describe the system as it now behaves, and closes the change. Use for "archive the change", "update living specs".
---

# Archive

Keep the description of the system true. The dated spec stays as history; the capability file is the current truth.

Read `.ai/sdd/CONVENTIONS.md` first. Run `node .ai/sdd/sdd.mjs gate archive`; stop if it is closed.

## Steps

1. **Work on the pull request branch.** The capability files change in the same pull request as the code, so they become true at the moment of merge and never before.
2. **Apply `## Requirements` to `.ai/specs/capabilities/<capability>.md`,** one file per capability:
   - ADDED: append the requirement with its criteria.
   - MODIFIED: replace the requirement of that exact name. If the file does not record it yet, add it.
   - REMOVED: delete the requirement of that exact name.

   Capability file shape:

   ```markdown
   # Capability: <slug>
   <One sentence: what this lets whom do.>

   ## Requirement: <name>
   The system SHALL <behavior>.
   Source: <change id>

   ### Scenario: <scenario name> (<change id> AC-3)
   - WHEN ...
   - THEN ...
   ```

   Criterion ids are unique within one change only, so a capability file always cites the change next to the id.

3. **Update the living threat model.** When `security.md` lists threats, fold them into `.ai/specs/security/threat-model.md`: the surface this change added, each threat with its control and the test that proves it, and accepted risks with who accepted them. Cite the change id. Create the file if this is the first change to need it.
4. **Check the result reads as a whole.** A capability file is a description of current behavior, not a changelog: no "previously", no dangling references to removed requirements.
5. **Clean up.** Confirm no mockup route or fixture remains in application code. Update the changelog when the repository keeps one.
6. **Close.** Run `node .ai/sdd/sdd.mjs done archive`; it refuses while a capability file or the threat model does not cite this change, or a `Frozen by:` test does not exist. Commit to the pull request branch and report that the change is ready for a human to merge.

## Rules

- Never edit the dated spec. Any edit after approval makes the approvals stale.
- A change with no observable behavior (refactor, tooling) has no requirements to apply. Record that in one line and close.
