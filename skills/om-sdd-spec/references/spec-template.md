# <Title>

Brief: <path to brief.md>

## TLDR
Two or three sentences: who needs this, what happens today, what will happen instead.

## Problem
What is being solved and the evidence that it matters.

## Open Questions
- Q1: <question, answerable with a word or a choice>

## Solution
The approach in a paragraph. Alternatives considered and why they lost.

## Requirements

### Capability: <capability-slug>

#### ADDED Requirement: <name>
The system SHALL <observable behavior>.

##### AC-1 (ui): <scenario name>
- WHEN <condition>
- THEN <observable outcome>

#### MODIFIED Requirement: <exact existing name>
The system SHALL <full replacement behavior>.

##### AC-2: <scenario name>
- WHEN <condition>
- THEN <observable outcome>

Frozen by: `<path of the characterization test>`

#### REMOVED Requirement: <exact existing name>
Reason: <why it goes and what replaces it>
Frozen by: `<path of the characterization test>`

## UI
Screens and states, one line each, with the AC ids they show.
Mockup: `mockup/` in this change folder, once approved. Do not edit this line later.

## Design
Only what is unique: modules touched, data model and migrations, API contracts, sensitive data handling.

## Failure behavior
What breaks, and what the user sees when it does.

## Compatibility
Public surfaces that change and the migration or deprecation path for each.

## Plan

### Phase 1: <independently shippable outcome>
1. <step> - delivers AC-1 - test: `<path or name>`
2. <step> - delivers AC-2 - test: `<path or name>`
