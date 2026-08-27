# M6 · The run

Everything that surrounds the swing: where a run starts, how it ends well, how it ends badly, and
what the player is left holding. Direction 11's rule governs the whole milestone — **there is no
screen in the game that is not the world.** Every state is either the field or one glass card
parked on it.

Still no backend (ADR-0003). Where the design assumes other people, build the seam and fill it
locally.

---

## M6.1 · The daily field

Spec `17-daily-field`. A day is a named field of 40 bodies, seeded from the date so every player
flies the same one and every player's address 23 is the same body.

`VISION.md`'s finding is the thing to fix: generation is statistically stationary, so the first
planet and the sixtieth are identical draws and nothing gets harder past ~25 seconds. The only
escalation today is the player's own accumulated speed, which is emergent rather than authored.

So difficulty is an **authored geometry curve over altitude** — spacing, corridor width, body
radius — with standard bodies only. Express a day as a *recipe* so that adding body types later
is a data change rather than a rewrite. Measure the curve as percentiles of real play, never as
plausible round numbers.

One open measurement inherited from `VISION.md`: both course lengths fly the same corridor width,
and two of three recorded lives on the short course ended at a side wall inside 20 seconds. Measure
before assuming that is a skill issue.

**Acceptance**: a day is reproducible from its date; difficulty is a stated curve, not a constant.
**Verify**: `pnpm test` plus a generated-field report across altitudes.

---

## M6.2 · The front door

Spec `11-front-door`. Not a menu — **the bottom of today's field**, live: real first planets
breathing above (scouting the opening is part of the daily ritual), the boundary already present,
the craft on the pad at rung zero. One blinking verb, `PRESS TO FLY`. The title floats over the sky
like a constellation label. Modes and standings are a hold away, on glass cards over the same
living field.

The social line (`3 481 FLYING · 2 FRIENDS DONE`) has nothing behind it offline. Show what is true
locally and leave the seam.

**Acceptance**: pressing anywhere begins the run; there is no screen that is not the field.
**Verify**: fly it.

---

## M6.3 · The finish line

Spec `12-finish`. The boundary's mirror: same grammar, opposite verdict. Half a screen below the
checkered line begins the safety carpet; cross into it and the run is mathematically over.

**Gravity lets go — your last swing doesn't.** The trajectory of the final release carries into the
carpet: fling hard left and you travel far left while the lift gently trues you up to a left-side
finish. The carpet corrects, it never erases; the finish position is the last release's signature.
The lift blends velocity over ~400ms, opens the throttle at 50%, and throws the craft past the top
of the screen. **No hitstop at the crossing** — that grammar belongs to decisions, and there is
nothing left to decide. Then the camera holds on the cooling line for ~800ms and lets it go.

LUMEN gains its one world monopoly here. The checker is the game's only pattern fill. Carpet dots
pay flat and unmultiplied — found money, the argued exception to the constitution.

**Acceptance**: the finish lane follows the last release; the carpet accepts no input.
**Verify**: `pnpm test` on three final swings — straight, hard left, hard right.

---

## M6.4 · The debrief

Spec `09-debrief`. A translucent card parked **over the crash site**, with the field still alive
behind it: embers settling, the boundary still breathing, the bank ring planted at the death
altitude. 82% VOID glass, square corners, double rule — the one rectangle in a game of circles.
It snaps in over two frames at 0.8s; tally rows land one per ~120ms with a tick; at 1.6s the verb
blinks at 1Hz. **Arcade cabinets cut; they do not fade.**

The debrief line is assembled by the run itself — cause, address, one true number — so every death
reads like a black-box recording: `LEFT THE FIELD AT THE RIGHT WALL · ON FIRE`. Never scold, never
joke at the player. Bank never counts down: on death it snaps to DUSK and the card states the number
once, because a draining counter is mockery and a stated fact is an epitaph.

This answers the biggest hole `VISION.md` names — across the recorded corpus only 32% of
out-of-bounds deaths ever had a rescue cue on screen, so every death needs an account of itself.

DAILY has no retry, so its blinking verb is SHARE; tap and hold are the only inputs, here as
everywhere.

**Acceptance**: every distinct death produces a correct, specific line; the field keeps animating
behind the card. **Verify**: `pnpm test` on line assembly, plus eyes.

---

## M6.5 · The results sheet and the recipe

Spec `10-results`. **The route is the trophy** — a score is a claim, a route is a proof. The run
drawn as a light-line through the whole field, composed inside a 4:5 safe frame with the wordmark
on the glass and no chrome to crop out. White line, gold dots at the PERFECTs, green ticks at the
SHARPs, pink where the line dared to live in fire, violet stratum for the anomaly, DUSK circles for
spent bodies. No legend, because every mark keeps its in-game meaning.

The recipe line makes a shared run a replayable fact rather than a picture of one. Offline it is a
long code carrying the real log — a twelve-character code cannot contain a compressed input log,
so Direction 10's `APH-214-KX7Q` is a service handle and belongs to the seam, not to v1.

**Acceptance**: the sheet renders inside the safe frame at 4:5; a pasted recipe replays the run.
**Verify**: `pnpm test` plus a screenshot.

---

## M6.6 · Standings and ghosts, locally

Ranks are altitude: names planted at the height they reached, the gap to the next drawn in ION in
the game's own units (`+1 363 · ONE SWING`), percentile leading position. Offline the board is the
player's own history and the ghosts are the player's own past runs — which is the entire mechanism
a service would later populate with other people.

**Acceptance**: a past run replays as a ghost against a live attempt on the same day.
**Verify**: fly against yourself.

---

## M6.7 · DRIFT

ADR-0007. The same run on a random seed: unlimited, no standings, no submission, its own local
best. Nearly free once DAILY exists — a different seed source and no submission — and it is where
the appetite to keep playing goes, so DAILY can stay scarce.

**Acceptance**: DRIFT shares every system with DAILY and differs only in seed source, submission
and the debrief's verb. **Verify**: a reviewer confirming there is no DRIFT branch in the grader
or the economy.

---

## Gate

**The author flies a full day.** Next: [M7](./m7-powerups.md).
