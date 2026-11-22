---
name: om-sdd-secure
description: Stage 4 of SDD. Threat-models one approved change before any code is written - new attack surface, threats per element and per acceptance criterion, a decision for each, and security criteria (SEC-n) that become required tests. Updates feed the repository's living threat model. Use for "threat model this", "security review of the spec", "secure".
---

# Secure

Find how this change can be abused while fixing it is still cheap. Every threat ends in a decision, and every mitigation ends in a test that verification will demand.

Read `.ai/sdd/CONVENTIONS.md` first. Run `node .ai/sdd/sdd.mjs gate secure`; stop if it is closed. This stage can run while the mockup is being reviewed.

## Steps

1. **Load context.** The approved spec, the living threat model at `.ai/specs/security/threat-model.md` when it exists, and the code the change touches: how requests are authenticated, how data is scoped, where input is validated. Existing controls are facts you read in the code, not assumptions.
2. **Describe the surface this change adds or alters:** entry points (routes, jobs, webhooks, uploads, imports), data read or written and how sensitive it is, trust boundaries crossed, outbound calls, and who may now do what. If there is none, write `Surface: none` with the reason and go to step 7.
3. **Find the threats, in two passes.**
   - Per element of the surface, walk STRIDE: spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege.
   - Per acceptance criterion, write the abuse case: the same action by a user of another tenant, by a lower role, with no session, with someone else's record id, twice in a row, with oversized or malformed input, with a field the form does not show.

   Keep only threats this change creates or exposes. A generic risk the change does not touch is noise.
4. **Decide each threat.**
   - `mitigate`: name the control. An existing control counts only if you read it in the code and the change really passes through it. A control that changes behavior a user can see goes back to `om-sdd-spec` as a requirement.
   - `accept`: you may propose it, never decide it. Write `Decision: accept` with the reason and the residual risk; the proposal becomes an accepted risk only when a human runs `approve secure`. Propose acceptance when a mitigation would change behavior the owner chose, never because a mitigation is inconvenient.
5. **Write a security criterion for every mitigation,** in the same form as acceptance criteria. It describes the attack and the required outcome, at the level where the control lives:

   ```markdown
   ##### SEC-1: A user of another organization cannot export
   - WHEN a signed-in user requests the export of an order list outside their organization
   - THEN the response is 404 and nothing is written to the audit log as a success
   ```

6. **Have it attacked.** Give a fresh-context subagent the spec and your threats, and ask it to break the design: what did the list miss, which mitigation does not actually stop its threat, which criterion would pass while the attack still works. Add what it finds.
7. **Write `security.md`** in the change folder:

   ```markdown
   # Security: <change id>
   Surface: none - <reason>            (only when nothing is added or altered)

   ## Surface
   ## Threats
   ### T-1: <who does what> (<STRIDE category>, <high|medium|low>)
   - Element: <entry point or data>
   - Decision: mitigate | accept
   - Control: <what stops it, with the file when it already exists>
   - Test: SEC-1
   ## Security criteria
   ##### SEC-1: ...
   ```

   Run `node .ai/sdd/sdd.mjs done secure`. It checks that every threat has a decision, every mitigation names a criterion, and every criterion belongs to a threat. When a risk is accepted, the stage waits for a human to run `approve secure`.

## What happens next

Validation confirms the controls fit the codebase. Implementation writes one test per `SEC-n`, named with the id. Verification refuses to pass without them. Archive folds the threats and controls into the living threat model.

## Rules

- This is design-level threat modeling. It does not replace a penetration test, and it says so in `security.md` when the change is high risk.
- Never run `approve secure`, and never drop a threat because its mitigation is inconvenient. In your report, name every risk you propose to accept and what the owner would have to change to mitigate it instead.
- Security tests run against the local test environment only, with invented data. No real credentials, no production targets.
- Rate each threat by what an attacker gains and how easily, not by how likely you think an attempt is.
