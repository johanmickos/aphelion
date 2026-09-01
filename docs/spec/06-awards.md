# 06 · Awards and callouts

**Board**: [Direction 06 — Awards + Callouts, rev 2](../design/Aphelion%2006%20-%20Awards%20%2B%20Callouts.dc.html).

**Rulings applied**: this board's rev 2 vocabulary is the ruling — **TRUE / SHARP / PERFECT plus
an unnamed make**. `DEADEYE`, `SHAVED` and `CLEAN` (Directions 01 and 02) are retired.
**Direction 06 owns the presentation** — word over points, born at the dot;
[Direction 08](./08-economy.md) owns the arithmetic. Every absolute point value printed on this
board (`+445`, `+556`, `+668`, `+890`) is a stale illustration from a superseded scoring model
and is carried nowhere. Callouts are set in **Archivo 800**, not the display face. A missed
release **defers** the carry rather than destroying it (ADR-0008), which amends this board's
"no word, no points" to "no word, no cash".

**Depends on**: [00 · Tokens](./00-tokens.md), [08 · Economy](./08-economy.md).

---

> ## ⚠ Flown, 2026-08-29 — the zones stand; what `W` means has moved
>
> **§2's four zones are built exactly as written** and are asserted at every boundary from both
> sides, including both worked examples: at `W = 15°` the PERFECT zone is 1.5° and the floor
> binds; at `W = 40°` it is 3.2°. Nothing in the ladder, the streaks, the callout or the miss has
> changed. Two things about the **`W`** those fractions are taken of are worth knowing here.
>
> **`W` is the width the compass *draws*, floor and all.** Spec [00 · §6](./00-tokens.md) now puts
> a minimum width under an arc the geometry earns nothing of, so the drawn width and the earned
> width come apart on the narrowest windows. The drawn one is what grades, on the prototype's
> rule: *"the player must never be scored against something they cannot see. One sweep produces
> the rings that get drawn AND the alignment that gets paid, so the two cannot drift apart."*
>
> **The 1.5° floor takes a larger share of a narrower window, and that is §2 working.** The floor
> is absolute while every other zone is a fraction, so the narrower the window the more of it pays
> the top word — at a 40° window the PERFECT zone is 16% of it, at 15° it is 20%, and below 3° it
> is the whole window. Spec 00 §6 rules that a narrow window is *"automatically a better-paid
> one"*, and this is the mechanism rather than a defect.
>
> **Which leaves one thing this file cannot settle.** Window width falls with distance, so the
> furthest body always has the narrowest window and is therefore the best-paid release on the
> instrument — *"the far away ones feel really tricky to aim for and that makes me WANT to aim for
> them, even though I want to guide players to slingshot to nearby planets"* (author,
> 2026-08-29). Grading is a pure function of `(d, W)` and imports nothing from the economy, which
> is this file's own acceptance and is not up for negotiation; **pricing distance is spec
> [08](./08-economy.md)'s arithmetic and [M4](../plan/m4-the-economy.md)'s**.

> ## ⚠ Flown, 2026-08-29 — §4's pop is a throw and its bloom is a rim
>
> **§2's tier colours, sizes and zones all stand.** What moved is §4's presentation of them, in
> three notes from one sitting.
>
> **The bloom is withdrawn.** §4 gives each tier a glow behind its word — 5 / 8 / 12px in the tier
> colour — and flown it fights the thing it is lighting: *"the blur circle behind the popup text
> isn't doing us any favours, it's blurring the legibility. We should remove it"* (author). What
> keeps the type readable over a planet instead is a **rim**: a thin dark stroke around the
> letters, in **VOID** rather than black, on the prototype's own reasoning for its own — *"a heavy
> black outline under pale text reads as a sticker."* It is paint, so it lives in the renderer;
> what presentation state carries is the space it needs, so spec [00 · §7](./00-tokens.md) stays
> assertable without a canvas.
>
> **And the E3 under PERFECT goes with it** — *"there's a weird white-ish blur circle that appears
> when I get 'perfect', in addition to the yellow one beneath the text. I don't like that white
> one."* §2's energy column still ranks the tiers; what it no longer does is light spec 00 §3's
> single flash. **Nothing strikes one now**, the release and the grab having gone the same day.
>
> **The pop is a throw.** §4's *"120ms upward, ~30px, one overshoot"* is superseded, on the
> author's instruction to consult the prototype: *"the popups should pop upwards a bit more,
> mimicking the physics feeling that we have in the original prototype."* What that codebase does
> is not a pop — the word **rises across its whole life** on `1 − (1 − u)²`, decelerating, *"so the
> popup leaves the ship promptly and then hangs where it can be read."* Carried as behaviour
> (ADR-0013): **34 prototype units** (102 design), fastest at birth, 43.75% of the way up by a
> quarter of its life, and never coming back down. An overshoot is a spring; this is a throw.
>
> **§4's linger and decay stand**, and they are what settle this file's old disagreement with spec
> [02 · §2](./02-release.md) — see that file's rebase notice. The word now lives **1 600ms**: the
> linger, the decay, and no separate pop to add.
>
> **§2's grading is symmetric and stays so.** Raised from flying — *"the player should still get
> award text if they grab after the planet dot, but still in the window"* — and it already does,
> because `d` is an **absolute** offset. Measured over the recorded dispatches, 40 graded releases
> fell short of the dot and 50 past it. Now asserted rather than merely true.

> ## ⚠ Flown, 2026-08-29 — the make's silence is a missing number, not a missing word
>
> *"I released what I thought was within the planet window and I got no text accolade for it. How
> does this translate to the future points system and current tiers of text? Do we need to add
> another text tier?"* (author).
>
> **The grading was right.** Measured on that run, four of its seven graded releases were **makes**
> and landed well inside their windows; the one release that said nothing *and* deserved nothing
> was outside its window by 29% of a half-width.
>
> **No new tier.** §1 refuses a fourth word outright and gives the reason — *"a word for 'merely
> made it' devalues every word above it"* — and §2 already answers the question: a make is
> `×1.0`, **CORE at 70%**, E1, *"none — points only"*, and §4 gives it *"points only, at 13px."*
> **A make is specified to speak, in numbers.** It is silent today because the economy is spec
> [08](./08-economy.md)'s and arrives in M4, so there is no number to show yet.
>
> So this is a **sequencing gap** and it is worth naming as one: until M4, the most common
> successful release in the game says nothing, and the M2 gate is being flown that way. A CORE dot
> was tried as a stand-in for the missing number and withdrawn the same evening — *"there's some
> small white dot being left behind at times, can you identify it and remove it?"* — because a
> stand-in that reads as debris is worse than the silence it fills. What a make shows meanwhile is
> its **taken window**, lit and decaying over spec 02 §6's 420ms with the rest of the instrument.

> ## ⚠ Ruled and built, 2026-08-30 — a capture earns a word too, and §1 survives it
>
> **§1's *"grabs are never graded; only releases are"* is overturned by the author**, who asked for
> quality keywords on good **captures** as well: *"a perfect capture is at the closest approach,
> within some short distance of the planet surface... These are invisible, which is explicitly OK,
> because the visual cue is really the ship's proximity to the planet."*
>
> **§1's law is kept rather than bent**, and how is the interesting part. *"A word that never
> repeats never becomes a signal"* is a rule about **frequency**, so a second event spending the
> same three words would have halved what each is worth. What was built instead is **one rung** —
> ruled by the author — with **three words on it** so the one rung does not go stale:
> `TIGHT · NERVE · BRAZEN`, chosen by the body's own address so a run replays to the same words.
> They are about **nerve** rather than precision, which is where a first set went wrong: TRUE,
> SHARP and PERFECT already own precision, and an arrival is not a more accurate release, it is a
> braver one. The brief was *"driving your ship dangerously close, then slamming the brakes to get
> a perfect slingshot."*
>
> **It gets its own slot**, also ruled: the two words are at different places — the body you
> arrived at, versus the dot you left from — so they never collide, and sharing would have let a
> freeze cut short a release word still lingering. §4's *"one release, one word"* is unchanged; it
> is one word **per event**, and there are now two kinds of event.
>
> **What is graded is a distance and not depth**, and that is measured: depth saturates at p50
> exactly **1.00** over 493 captures, so more than half of everything would earn the top word.
>
> ## ⚠ Built, 2026-08-30 — a third word, for the collision, and §8's register is broken on purpose
>
> Asked for by the author after flying a capture that read as a crash: *"I caught a planet at the
> very last second, abruptly changing angle/course to circularize. For moments like these, with
> strong kinks in the capture/arrival path, I'd like to pop up thematic pink text saying things
> like 'Bonk!' 'Oof!' etc. to indicate a big collision."*
>
> **Nothing had to be invented to detect it.** Spec 01 §10's **floor** has caught the craft since
> M1, keeping the tangential half of the velocity and removing the radial half, and that removal
> *is* the kink. On the flagged run the tick before the freeze turns the craft **45.7°** and takes
> **290** of its speed — three times sharper than anything else in the run. The word is
> `BONK · OOF · THUD`, chosen by the tick, because a knock is a property of the moment where an
> **arrival** is a property of the body.
>
> **It is the arrival's opposite end, and that fixes its threshold rather than taste doing it.**
> How much the floor takes is a reading of **aim**: over 77 real captures the two run together at
> **r = −0.44**. So the plunges that used to steal the arrival's word are exactly the ones that get
> this one. Because the two grade one geometry from opposite ends, **they must never contradict** —
> congratulating a capture and calling it a crash in the same breath is worse than silence — so the
> band sits above the hardest knock any tight arrival takes, measured at **12.9%**. At 15% it
> selects **4% of captures**, and over the author's whole corpus there is not one tick where both
> words are lit.
>
> **§8's register is broken, and the break is the author's.** *"State what happened, name the
> place, one true number, never scold, never joke at the player"* exists so the game is never
> clever at the player's expense, and onomatopoeia is not: it is the noise the world made, not a
> remark about the pilot. `OOF` is the closest to that line and stays because the author wrote it.
>
> **Pink was already spoken for, and correctly.** Spec 00 §1 gives **ION** a monopoly — *"risk, and
> nothing else in the world glows pink"* — so the author's *"thematic pink"* needed no new token.
> It is the only word in the game drawn in something other than a body's own hue, because it is not
> about the body: it is about what the floor had to do.
>
> `SIM_VERSION` did not move, checked the same way as the aim change below.
>
> ### ⚠ Re-ruled 2026-09-01 — the share was not a reading of aim, and the word was silent
>
> **`KNOCK_BAND` is 0.01, not 0.15, and `struckHard` asks about aim directly.** The paragraph above
> is left as written because its *reasoning* still holds — the two words grade one geometry from
> opposite ends and must never contradict — and only its *mechanism* was wrong.
>
> The author, with a run under it: *"the last capture and orbit in the 2026-09-01 02:29 dispatch
> should've shown the knock effect."* It takes **5.7%** of its speed from the floor at an aim of
> **0.006**, and at 0.15 it said nothing. Nothing did: over 78 captures in 14 replayable dispatches
> the band selected **zero**.
>
> **The `r = −0.44` above is why.** It is a correlation, not an identity, and the residual is where
> the two words met: the hardest floor landing in the corpus, **14.1%**, is a capture at aim
> **0.994** — as sideways as the game gets — because it is *slow* (entry speed 291 against a corpus
> median near 700), and a small absolute cut is a large share of a small speed. The share saturates
> at low speed, the same failure `ARRIVAL_REF_SPEED` corrects on the arrival's side.
>
> So the invariant moved from a threshold to a predicate: a knock now asks for an aim strictly
> **below** the line the arrival asks it to be at or above, at the same speed, and the two words
> cannot contradict because the test granting one denies the other. It fires on **1 capture in 78 —
> rarer than the 4%** the 0.15 was measured to select. `SIM_VERSION` did not move; `struckHard` is
> read only by presentation state. The argument and the numbers are in
> [M3 · the field](../plan/m3-the-field.md).

> ## ⚠ Ruled and rebuilt, 2026-08-30 — closeness is half the test, and **aim** is the other half
>
> The band below shipped alone for a day and the author flew it: *"some of the captures were too
> easily giving away the word."* The measurement under it is the reason, and it is a **finding
> rather than a tuning problem**. At the freeze, over 374 captures, the closest approach lands p25
> **0.3** design units above the floor, p50 **1.2**, p75 57. That is not a spread — it is nearly
> **binary**, because **the floor is a guarantee, so a dive pointed at a body reaches it for
> free**, and 68% do. No threshold selects a rare group: 4 units catches 68%, 25 catches 71%, 80
> catches 77%.
>
> So a second reading was added rather than the first one tuned: **aim**, the sine of the angle the
> press was made at. A coasting craft feels no gravity, so the path a press interrupts is a
> straight line and this is that line's true angle. The word now needs both — *you got to the
> surface*, and *the body had to be caught rather than hit*. On the author's own 71 captures that
> is **13%**, the frequency this word was aimed at from the start, against 75% for the closeness
> alone. The run that ruled it is kept as `test/recipes/arrival-flown.json`.
>
> **The denominator was got wrong once and the author found it in one run.** The first attempt
> compared the undivided impact parameter to the floor — *"the line you were on would have missed
> the surface, and you got to it anyway"* — which reads beautifully and is broken, because that
> distance can never exceed the radius it is measured at. A press made 16 units above a floor of
> 159 has a ceiling of 1.10 floors however perfectly it is flown, so the test became unreachable
> for the most committed presses in the game. The author flew exactly that one: *"my last capture
> felt really tight and should've been awarded a word."* Dividing by the radius as well as the
> speed makes it an **angle**, which is scale-free, and fixes it at the root.
>
> **The threshold is ruled by an example rather than derived**, which is worth being plain about.
> 0.7071 — exactly 45°, where a craft closes sideways as fast as inward — needs no constant and was
> the candidate. It was rejected because the author's *"really tight"* capture measures **0.708**,
> and a line their own example clears by one part in a thousand is a coin toss. It sits at 0.6, 8°
> inside, and ADR-0004 is the authority: the author is the feel gate.
>
> **`SIM_VERSION` did not move**, and that was checked rather than assumed. The dive and the orbit
> both gained a recorded number, so the snapshot grew and its fingerprint moved — but no tick flew
> differently, which was proved by adding the fields with the snapshot untouched and watching
> `test/sim/version.test.ts` go on passing. The author's whole dispatch corpus still replays. See
> that test's own comment for the rule.
>
> ## ⚠ Superseded — the band alone, as first shipped
>
> Measured at the freeze over **374 captures on the current physics**, the closest approach lands
> p25 **0.3** design units above the floor, p50 **1.2**, p75 57, p95 250. That is not a spread —
> it is very nearly **binary**, because the dive clamps at the floor and **68% of dives reach it**.
> No threshold selects a rare group: 4 units catches 68%, 25 catches 71%, 80 catches 77%. Two other
> axes saturate the same way — the speed at the freeze is at its clamp on **51%** of captures, and
> *close **and** fast* is still 33%.
>
> **So closeness alone cannot make this rare.** The two paths recorded here were a **streak** and
> *"a different axis, the dive's **aim** being the one thing the player controls that the floor does
> not clamp."* The author chose the second and it is built, above. The streak is unspent and §3's
> grammar still exists for it.

## 1 · The law

**Points for the make. Words for the mastery.**

A word that never repeats never becomes a signal, and a word for "merely made it" devalues every
word above it. So the baseline tier speaks in points alone, and the vocabulary is exactly three,
on the rarity ladder players already know.

Streaks escalate by **counting**, never by inventing a synonym.

## 2 · The tiers

The grade of a release is a pure function of where inside the window it landed. Let `W` be the
window's angular width and `d` the absolute angular offset of the release from the window's
centre (the dot).

| Tier | Zone | Multiplier | Colour | Energy | Word |
|---|---|---|---|---|---|
| *(miss)* | `d > W/2` | — | — | — | none. See §5 |
| **make** | `d ≤ W/2` | **×1.0** | CORE at 70% | E1 | **none** — points only |
| **TRUE** | `d ≤ 0.30 W` (inner 60%) | **×1.25** | CORE | E1 | `TRUE` |
| **SHARP** | `d ≤ 0.15 W` (inner 30%) | **×1.5** | LUMEN | E2 | `SHARP` |
| **PERFECT** | `d ≤ max(0.08 W, 1.5°)` | **×2.0** | SOLAR | E3 | `PERFECT` |

Zones **scale with the window**, so difficulty prices the words automatically: a PERFECT on a
needle-thin arc is a different feat than on a barn door, and the arc's width already said so. The
`1.5°` floor stops the PERFECT zone becoming unhittable on the narrowest windows.

Tiers differ by **type scale, colour and bloom only**. They never differ by anything else, and
the colour ladder is white → green → gold, the rarity convention players arrive knowing. Violet
is deliberately absent: purple means strange, never good.

**Tiers are identical in every mode.** Modes may change what the currency is and what death takes;
they may never change how a swing is graded (spec [08](./08-economy.md)).

## 3 · Streaks

A streak counts **consecutive releases at the same tier**. It is accuracy. (Chain is engagement
and is a different system, in a different pixel — spec [08](./08-economy.md).)

| Rule | Behaviour |
|---|---|
| Per-word | A separate count per tier. `PERFECT ×N` counts consecutive PERFECTs |
| Broken downward only | Any **lesser** graded result resets the count |
| Upgrades | A PERFECT does not break a SHARP streak — it **upgrades** it, ending the SHARP count and opening `PERFECT ×1` |
| A make | Is a lesser result, and resets any streak above it |
| No timer | Coasting between grabs cannot expire a streak. Only a graded release or death changes it. Expiry-by-clock would punish route-reading |
| A miss | Is not a graded release. It **does not change the streak** (ADR-0008) |
| Death | Ends every streak |
| First display | `×N` appears at the **second** occurrence |
| Merge | A repeat arriving within the previous callout's linger merges in place: the counter ticks and re-pops smaller, rather than spawning a second callout |
| Multiplier | **+10% per step**, where step = `N − 1`, **capped at 5 steps**. So `×1` → ×1.0, `×3` → ×1.2, `×6` and above → ×1.5 |

Longest PERFECT streak is a headline stat on the results sheet (spec [10](./10-results.md)).

## 4 · The callout

The word, its points and its colour arrive as **one unit** at the release point.

| Property | Value |
|---|---|
| Composition | Word over points, centre-aligned, one unit |
| Type | Archivo **800**, caps, tracked **0.1em** |
| Size | TRUE 15px · SHARP 18px · PERFECT 21px (design px). A make shows points only, at 13px |
| Bloom | TRUE 5px · SHARP 8px · PERFECT 12px, in the tier colour |
| Birth | At the compass dot that earned it, offset **8–30px** off the dot |
| Pop | **120ms** upward, ~30px, one overshoot |
| Anchor | Then **world-anchored** — it drifts past at world speed as the craft climbs |
| Linger | ~**1.2s** at full opacity |
| Decay | 400ms to zero. Dead by T+510ms from release (spec [02](./02-release.md)) |
| Collision | A new callout snaps the previous one to its decay tail. Queueing is structural: one release, one word, and the one-E3-at-a-time rule means two can never fight |

The pop buys the glance; leaving it behind sells the speed. Score meets attention where attention
already is — no band at the top of the screen.

## 5 · A miss

A release outside the window gets **silence**: no word, no sting, no confiscation. The grab that
was not made is the feedback.

Per **ADR-0008**, an out-of-window release **does not cash at all**. The carry is neither lost nor
paid — it rides into the next swing and cashes when a graded release finally earns it. A bad
release is a debt, not a loss.

## 6 · Chain milestones

Chain milestones (**×5, ×10, ×15**) get a masthead pulse and one bloom step on the craft. **No
word.** The number is the callout; vocabulary is reserved for releases.

## 7 · What gets no word, ever

Event words are deleted. There is no callout for entering an anomaly, grazing the boundary,
surviving a burn, or reaching a milestone. The aurora is the callout; a word on a spectacle is a
caption on a firework.

## 8 · The debrief voice

Every death line is assembled by the run itself: **cause + place + one true number**, so every
death reads like a black-box recording.

```
LEFT THE FIELD AT THE RIGHT WALL · ON FIRE
RAN DRY AT 23 · THE FIELD KEPT GOING
MISSED THE LAST PRESS BY 0.2s · 1 450 M/S AT THE LINE
FELL INTO THE JADE ONE · CHAIN ×11 WENT WITH YOU
```

Rules of the register: **state what happened, name the place, one true number, never scold, never
joke at the player.** A body is named by its hue ("the jade one"), an altitude by its address.
Composition is spec'd in [09 · Debrief](./09-debrief.md).

## Acceptance

- Grading is a pure function of `(d, W)` and imports nothing from the economy. Deleting the
  economy (ZEN) leaves the tier, the word, the colour and every timing above unchanged.
- The four zone boundaries are exact at `d = W/2`, `0.30W`, `0.15W`, `max(0.08W, 1.5°)`; a test
  that releases at each boundary ± one tick's angular travel lands on the expected side.
- With `W = 15°`, the PERFECT zone is 1.5° (the floor binds). With `W = 40°`, it is 3.2°.
- The sequence SHARP, SHARP, PERFECT, SHARP yields streak states `SHARP ×1`, `SHARP ×2`,
  `PERFECT ×1`, `SHARP ×1`.
- A release outside the window changes no streak counter and cashes nothing.
- Three releases inside 0.4s produce exactly one live callout and no overlapping text.
- No callout ever renders in an identity hue, and no body, ring or gauge ever renders in LUMEN or
  SOLAR.
