---
name: om-sdd-discover
description: Stage 1 of SDD. Turns an idea, issue or client request into a one-page brief for a single initiative (one epic), with scope, rules, slices and tagged assumptions. Also takes in requirements that already exist (a PRD, a client document, a ticket) without re-interviewing. Use before writing a spec, for "discover", "scope this", "write a brief", "we already have requirements".
---

# Discover

Decide what one initiative is and is not. The output is `brief.md`: one page about one initiative, not a description of the product.

Read `.ai/sdd/CONVENTIONS.md` first.

## Steps

1. **Read before asking.** The request, linked issues, notes the user points at, the code of the affected area, and capability files in `.ai/specs/capabilities/` that the initiative touches.
2. **Ask only what decides whether and what to build:** outcome, scope, slices. Two or three questions at most, and never a fact the repository already answers. How a rule behaves in detail (formats, edge cases, error codes) is not a discover question: write it under Open questions and let the spec ask it.

   **One round for a small change.** When the request already states outcome and scope and you have no scope question, do not stop here. Write the brief, hand over to `om-sdd-spec`, and let the owner confirm the scope together with the spec's open questions in a single round.
3. **Write `brief.md`** in the change folder, 400 words at most:

   ```markdown
   # <Initiative>
   ## Outcome        what is true for whom when this is done, and how we will know
   ## Problem        who has it, what they do today, evidence
   ## Scope          In: ... / Out: ...
   ## Rules          business rules and constraints the solution must respect
   ## Slices         independently shippable parts, in delivery order
   ## Assumptions    each tagged [ASSUMPTION], with what would confirm it
   ## Open questions each with the person who can answer it
   ```

4. **Tag every claim.** A claim is evidence (cite the source: a ticket, a call note, a line of code) or it is `[ASSUMPTION]`. An assumption never turns into evidence because someone agreed with it.
5. **Get a skeptical read.** Give a fresh-context subagent only the brief and its sources. Ask what is unsupported, what is a solution dressed as a problem, and whether the slices are really independent. Fix what it finds.
6. **Confirm with the owner.** Show Outcome, Scope and Slices. Their confirmation is the gate. Then run `node .ai/sdd/sdd.mjs done discover`.

   When the owner cannot be asked (they said they are away, or the run is unattended), or the confirmation is being collected with the spec's questions, record `done discover --unconfirmed` instead. The scope then stays visibly unconfirmed until the owner approves the spec, and the spec lists it for confirmation. Never record a confirmation that did not happen.
7. **One change per slice.** This change carries the first slice. For each further slice, `node .ai/sdd/sdd.mjs new <slug> --brief <path to this brief.md>` when its turn comes.

## When requirements already exist

Requirements written elsewhere do not skip this stage; they shorten it. Start the change with `node .ai/sdd/sdd.mjs new <slug> --source <path>`, where the path is the document, or a copy or export of it committed inside the repository. The script pins its content.

1. Read the source in full. Do not interview.
2. Write `brief.md` as an index of the source, not a rewrite: each section states the point in a line or two and cites where the source says it. The source stays the authority.
3. Mark what the source does not answer. External requirements usually describe a solution, rarely say what is out of scope, and often hold several changes. Missing scope limits, rules and success measures go under Open questions, addressed to whoever owns the source.
4. Slice it. If the source describes more than one independently shippable change, list them under Slices; this change takes the first.
5. If nothing is missing, there is nothing to ask: confirm Scope and Slices with the owner and run `done discover`.

When the source document changes later, the script marks discover and the spec stale. Run this section again against the new version; `done discover` pins it, and the spec must be approved again.

## Rules

- No solution design here: no data model, no screens, no API. Those belong to the spec.
- One initiative per brief. A request that holds two is two briefs.
- Open questions that block scope stay open and are carried into the spec's gate. Do not answer them yourself.
