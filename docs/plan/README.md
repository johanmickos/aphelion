# The plan

Aphelion is being rebuilt from two sources: `docs/VISION.md`, which says what the game is
for, and `docs/design/`, twelve design directions that say what it looks like when it is.
A working prototype exists at `~/git/aphelion` and is consulted, never copied (ADR-0001).

This directory is the implementation plan. It is written for sessions that have not read
the conversation that produced it.

## Before you touch anything

Read, in this order: `CONTEXT.md` (the glossary — the words in it are the words to use),
`docs/adr/` (ten decisions, all of them still binding), the spec for the step you are
doing, and the design board that spec cites.

## How a step works

Every step names its **spec**, its **acceptance criteria**, its **verification command**,
and whether it ends in an **author gate**.

- One branch per step, one PR into `main`, squash-merged. A step is sized to one session.
- A step is done when `pnpm check` is green, its acceptance criteria are demonstrably met,
  and its status is updated in the table below.
- **A gated step stops.** Do not start the next step, do not "get a head start", do not
  decide the gate is a formality. The author flies the build and says yes. Gates exist
  because determinism can prove the game is correct and cannot prove it feels good
  (ADR-0004).
- If a spec is wrong, silent or contradicts another spec, **stop and say so**. Do not
  invent the ruling. Every contradiction anyone found while writing this plan was resolved
  by the author and recorded; a new one deserves the same.

## The milestones

Each ends in something that runs on a phone. That is deliberate: the author's gate is
playing it, so a plan whose first playable moment is late is a plan that cannot be gated.

| # | Milestone | Ends with | Gate | Status |
|---|-----------|-----------|------|--------|
| [M0](./m0-foundations.md) | Foundations, specs, renderer verdict | Specs written, a field you can pan, a renderer ADR | — | **M0.1–M0.3 done** ([specs](../spec/), scaffold, the three layers and `pnpm portable`) — CI and the Pages deploy are written but have never run; the repo has no remote yet and pushing it is deferred; M0.4–M0.5 not started |
| [M1](./m1-the-swing.md) | The swing | Crude shapes, real gravity, a flyable swing | **author** | not started |
| [M2](./m2-the-instrument.md) | The instrument | The compass, the release, the 400ms | **author** | not started |
| [M3](./m3-the-field.md) | The field | Rungs, sky, anomaly, boundary, retro grade | — | not started |
| [M4](./m4-the-economy.md) | The economy | Carry/cash/bank, tiers, fuel, HUD, ZEN | **author** | not started |
| [M5](./m5-audio.md) | Audio | The swing has a voice | **author** | not started |
| [M6](./m6-the-run.md) | The run | Front door, finish, debrief, results, DRIFT | **author** | not started |
| [M7](./m7-powerups.md) | Powerups | The field's generosity | — | not started |

## What is deliberately not here

- **No backend.** Offline v1, with the seams cut for a service later (ADR-0003).
- **No CORRIDORS, no ADVENTURE.** Both need authored content pipelines nobody has designed
  (ADR-0005).
- **No lives inside DAILY.** Unlimited play lives in DRIFT (ADR-0007).
- **No new body types in v1.** Difficulty comes from geometry first, so that when types
  arrive there is something to measure them against.
