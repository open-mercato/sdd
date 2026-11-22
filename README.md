# Open Mercato SDD

A spec-driven development workflow for coding agents: nine skills and one state script. An initiative goes in; a verified pull request and an updated description of the system come out.

**Status: preview.** The state script and the review server are covered by automated tests. The skills have been exercised by agents on a small example repository only; see [docs/test-results.md](docs/test-results.md) for what was and was not tested.

## The eight stages

| # | Stage | Skill | Leaves behind | Gate |
|---|-------|-------|---------------|------|
| – | entry | `om-sdd` | `.ai/sdd/`, `change.json` | – |
| 1 | discover | `om-sdd-discover` | `brief.md` for one initiative | owner confirms scope |
| 2 | spec + plan | `om-sdd-spec` | `spec.md` with numbered acceptance criteria and the plan | no open questions, human approves |
| 3 | mockup | `om-sdd-mockup` | high-fidelity mockup, reviewer comments | no open comments, human approves |
| 4 | secure | `om-sdd-secure` | `security.md`: threats, decisions, security criteria | every threat decided; a human approves accepted risks |
| 5 | validate | `om-sdd-validate` | `validation.md` | verdict go or conditional |
| 6 | implement | `om-sdd-implement` | pull request | all steps done, recorded green gate |
| 7 | verify | `om-sdd-verify` | `verify.md`, evidence per criterion | every criterion has evidence |
| 8 | archive | `om-sdd-archive` | `capabilities/*.md`, threat model | a human merges |

## Install

```
node install.mjs /path/to/your/repo
```

This copies the skills into `.claude/skills/`, vendors the state script and the conventions into `.ai/sdd/`, and creates `.ai/agentic.config.json` if there is none. Then:

1. List the commands CI runs under `validation.commands` in `.ai/agentic.config.json`. Optional `security.commands` (dependency audit, secret scan) run after them.
2. Commit `.ai/` and the skills on your base branch.
3. Ask your agent to use the `om-sdd` skill.

## What a person does

The agent does the stage work. `sdd.mjs` holds the state and the gates with no model involved, so a gate cannot be talked past.

Three commands belong to a person, typed in a terminal and confirmed with the change id:

```
node .ai/sdd/sdd.mjs approve spec
node .ai/sdd/sdd.mjs approve mockup
node .ai/sdd/sdd.mjs approve secure     # only when a risk is accepted
```

Outside a terminal `approve` is refused. Automation that must approve sets `SDD_NONINTERACTIVE_APPROVAL=<change id>`; the approval is then recorded and shown in `status` as non-interactive. Merging is always a human decision.

## What the script enforces

| Command | Guarantee |
|---------|-----------|
| `new` | one branch per change; state cannot be recorded from another branch |
| `approve` | pinned to the content of `spec.md`; a later edit makes spec, mockup, security and validation stale |
| `new --source <file>` | a requirements document is pinned; when it changes, discover and the spec are stale |
| `plan`, `step next`, `step done` | progress with commits, resumable, phases in order |
| `run-gate` | runs the base branch's validation commands, records the result for the current code, continues after an interruption |
| `diff-signals` | removed exports, destructive migrations, source without tests, silenced checks, possible secrets, leftover mockup markup, a changed gate |
| `evidence` | a test in the branch naming each `AC-n` and `SEC-n`; a screenshot for each `(ui)` criterion |
| `done <stage>` | refuses open steps, a stale gate, missing evidence, a verdict that differs from its report, an incomplete threat model, missing capability files |

## Mockup review

`om-sdd-mockup` builds the screens from the application's real components and adds one script tag. Reviewers press `C`, click any element and type. Comments land in `mockup/feedback.json` and `mockup/feedback.md` in the change folder, where the agent picks them up: cosmetic comments are fixed in the mockup, anything that changes behavior goes back to the spec.

```
node .claude/skills/om-sdd-mockup/review/server.mjs --change .ai/specs/<change>
```

## Repository layout

```
skills/            the nine skills (SKILL.md each), the state script, the review overlay and server
test/              automated tests of the state script and the review server
examples/mini-erp/ a small multi-tenant app used as a target for agent runs
scenarios/         agent test scenarios: prompts, setups, expected outcomes
docs/              test results
site/              the landing page
install.mjs        installs the skills into a repository
```

## Test

```
npm test                      # state script and review server, 26 tests
```

Agent runs are described in [scenarios/README.md](scenarios/README.md).

## Not covered

This set covers the path from idea to verified pull request. It does not cover issue triage, merge queues, dependency audits or pipeline setup, and the secure stage is design-level threat modeling, not a penetration test.
