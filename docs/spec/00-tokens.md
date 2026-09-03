# 00 · Tokens and the compass

**Board**: [Direction 01 — Tokens + Compass](../design/Aphelion%2001%20-%20Tokens%20%2B%20Compass.dc.html).
The board is canonical for appearance; this file is canonical for the numbers (ADR-0002).

**Rulings applied**: award vocabulary is TRUE / SHARP / PERFECT plus an unnamed make — the
board's DEADEYE / SHAVED / CLEAN is retired (Direction 06 rev 2); the display face is **Anton**,
not the board's Unbounded; the `P11`-style chips on the board are retired — a body is named by
hue in the run and by address in the retelling; a **held** body is E2 and alive, and goes DUSK
only after release (Direction 04 corrects this board explicitly); the board's "NEXT, IN ORDER"
footer uses obsolete numbering and is void.

---

> ## ⚠ Flown, 2026-08-29 — what the build found, and what it moved
>
> **M2.1 – M2.3 built this file and the author flew it.** Ten notes came back, and the ones that
> land here are below. Everything not named still stands; nothing below is rewritten in place,
> for the reason spec [02](./02-release.md)'s own notice gives — a rebase is a careful edit and
> the numbers under it are still being flown.
>
> **§3 · The E3 no longer fires at a release or at a grab.** *"The white dot that is emitted when
> I grab is too noisy and too much... let's let the PLANET speak about our grab, not some ambient
> glowing orbs."* Spec [04 · §3](./04-bodies.md) already had the body doing that — a held body is
> **E2 and alive**, and the compass draws itself around that glow — so the flash was a second
> voice saying the same thing. The step, its 400ms and the **one-alive-at-a-time** rule are
> untouched and still belong to the **award** and to the checkered line; the release is quiet
> until [M2.4](../plan/m2-the-instrument.md) brings the word and the farewell ring.
>
> **§3 · The bloom radii stand; the percentages do not.** *"All glow is too much. I want it
> fainter and more impactful."* E1 and E2 are drawn at **18%** and **30%** against this table's
> 35% and 60%. The radii are exactly as written — 6px, 18px, 48px, +4px a chain link, read into
> design units at three per board pixel — so the acceptance criterion below is untouched: bloom
> radius is still a pure function of the energy step and the chain, and what moved is an alpha,
> which §1 already makes the renderer's. **A body takes a third of that again**
> (2026-08-29): a held body jumping to E2 on top of its grip halo read as a lit
> blob rather than a rim. The craft keeps the table's own, because Direction 01
> rules it the brightest thing on screen always.
>
> **§3 · A body glows when it is *gripping*, not when it is reachable.** This table's *"E0–E1"*
> for a body AHEAD is read at **E0** until the body is actually pulling: `CONTEXT.md` gains
> **grip**, the live pull against the pull at that body's own floor, and a body lights at 0.3 of
> it. Read at the top of the range instead, twenty-four bodies bloom at once. What survives at E0
> is the rim, which is spec 04 §3's other sentence — *"a constellation of dim coloured rings,
> never a row of grey balls."* Rings, not blooms.
>
> **§3 · There is a surface this table does not have**: a wide, faint halo from a body's floor
> outward, in its own hue, at an alpha that grows with grip. *"The planets should have a fainter,
> much wider glow that grows with proximity."* Carried from the prototype, where the same span is
> the band an arrival's tightness is graded over — ours is spec 01's **depth**, and M4 is where
> the two meet.
>
> **§6 · *Reachable* has a number now, and it is borrowed.** This section asks for *"one
> concentric ring per reachable body"* and never says what reachable is. Unbounded, the geometry
> offers ten to sixteen rings at once. It is the prototype's aim range — about two body-spacings,
> *"anything beyond that is a long, featureless coast"* — capped at **four** rings, which is
> measured: over 342 releases that reached another body, the one actually grabbed next was among
> the four nearest **100%** of the time. Spec [17](./17-daily-field.md) still owns the number.
>
> **§6 · The window's width is the *quality* band.** *"Window width encodes difficulty"* stands
> and is the reason this changed: measured as *reachability* — every release landing within grab
> range — the median window is **360° wide**, because the median body is on offer from 1 680
> design units against a field spaced nearer 700. It is now the arc over which a release arrives
> within two of the target's **floors**, which is the one guarantee a grab makes: *"I don't want
> to highlight grabbable for most planets, but instead — if I release here I'll have a good chance
> of getting a high quality capture."* Flown, p50 **36.6°**, against this board's own 40° wedge.
>
> **§6 · A minimum width, and the compass grades the width it draws.** *"For very distant planets
> we still need to show a window... it's more important that the player knows roughly where to aim
> with little screen clutter."* An arc the geometry earns nothing of opens to 15° — spec
> [06 · §2](./06-awards.md)'s own narrow worked example — and the grading opens with it, on the
> prototype's rule that *"the player must never be scored against something they cannot see."*
>
> **§6 · A window heats over a quarter turn, not over itself.** *"When I hold an orbit and spin
> around, the compass windows pass too quickly... the original starts glowing before I touch
> them."* Measured, the hand is inside an arc for **3 to 4 ticks, 50 – 67ms**; heated on the
> prototype's alignment ramp instead, a window is lit **15 ticks, 250ms** before its dot.
>
> **§6 · The *ghost* is a `CONTEXT.md` collision and the word is now *crossing*.** This section
> calls the mark where the hand cuts a ring a ghost; the glossary spends that word on **a recipe
> played back beside a live run**. One word for two things is the fork AGENTS.md §2 exists to
> stop, and [M2.3](../plan/m2-the-instrument.md)'s own brief already writes *"the crossing dots"*.
>
> **§6 · The label is unbuilt, and it contradicts spec 04.** This table puts *"a chip at its
> window's tip"* on every ring; spec [04 · §5](./04-bodies.md) rules that in a run an address chip
> appears in **exactly one case** — two live targets too close in hue to tell apart — and the
> `P11` chips are retired, so a label that is not an address has nothing left to say. **One of the
> two is stale and neither says which.** Nothing is drawn, and §6's 12° label-collision rule is
> unbuilt with it.
>
> **§5 · The orbit path fades in, and that is not rule 1 being broken.** *"As soon as an oval
> orbit is possible I want it to fade in, not just snap into view"* (author, 2026-08-29). §5's
> *"things arrive; they do not fade in"* governs elements **entering**, and the softness it
> forbids is exactly the defect it names. What fades here is a **prediction firming up** — the
> compass draws the orbit the craft is currently on from the moment gravity binds it, and the fade
> is that answer's confidence. The element does not enter softly; the answer does.
>
> **§5 · ENTER is spent, and on the instrument.** *"When I grabbed and captured,
> the compass would grow/shrink bounce a little... like my ship's HUD was coming
> online in orbit"* (author, 2026-08-29). §5's token is exactly that — 120ms,
> from 92% scale, with the overshoot its curve's 1.6 describes — and it fires
> once, when the rings arrive at the freeze. It scales the rings and the hand and
> never the orbit path, because the craft is on the path. What it is deliberately
> **not** is the prototype's continuous pump, which that codebase measured at
> *"85 out to 97 and back over about a second"* and removed. **And it leaves by what it
> arrived by** (2026-08-29, revised the same day): the compass draws back to §5's own 92% over
> 100ms and fades out, rather than vanishing. It **was** §5's overshoot read backwards, swelling
> 3.5% and then collapsing inward — and flown twice, that read as a jump rather than as a click:
> *"it still reads jumpy, and I think we should try just having it shrink in radius a touch and
> then fade out."* Measured, two things were wrong with it and neither was the idea. The swell was
> **one frame** — out on the tick after the release and back on the next — and sixteen
> milliseconds each way is under the span at which the eye reads a direction, so *attack ≤ 2
> frames* buys a flinch when it is run backwards onto an exit rather than forwards onto an
> arrival. And it never faded: the last frame it was drawn on was **78% scale at 31% opacity**,
> cut off mid-gesture, with steps of −1.8%, −5.3%, −8.1%, −10.5% so it moved fastest at the
> instant it disappeared. What replaces it is **even steps and §5's own DECAY** — 1.6% a tick,
> nothing accelerating, and 3% opacity on the last frame, so there is nothing left to cut. The
> mirror is the **size** rather than the shape, which is what made the two ends one gesture in the
> first place.
>
> **§6 · The grab filament fades with distance.** State 1's row describes a line and not a
> brightness, and it was drawn at a constant E2. The hold ends on a release and on nothing else, so
> a grab that never captures keeps that line at full strength all the way out of the field —
> measured, a craft can drift to 1.78 × a body's reach still tethered. *"Sometimes I grab too late
> and float away while tethered, and the dying brightness would be diegetic"* (author,
> 2026-08-29). It now runs from E2 against the body down to a quarter of that at the edge of the
> body's reach, and floors there: past the reach there is nothing left to feel, but a filament at
> zero would take the last sign that the craft is still attached and still spending a grab. It is
> measured against the **reach** rather than against grip, which falls as 1/r² and would put the
> line at 0.009 exactly when the player catches something at range.
>
> > ### ⚠ The legibility answer was tried and did not land in flight, 2026-09-02
> >
> > The same feeling came back, about the same thing: *"I feel like the last grab/capture should've
> > force-released at some point. I shouldn't be able to hold on to a planet outside its grab
> > distance"* (author, on `diagnostics/2026-09-02T17-23-27-399Z`). **The cue was doing exactly what
> > this ruling asks** — burning at its floor for four straight seconds of that hold — and it did not
> > carry the message. Choosing legibility over a mechanism was a real decision and this is the
> > evidence against it; it is recorded here rather than reversed, because reversing it is the
> > author's.
> >
> > **And the cause was not an orbit that grew.** Measured: the press at tick 1160 landed with the
> > craft at **0.28 ×** that body's reach and already **receding at 892 design units/s where escape at
> > that radius is 791** — so the grab was *unbound from its first tick*, never froze, and the whole
> > five seconds is one dive receding to **1.53 ×** the reach. `src/sim/dive.ts` names precisely that
> > case: *"an unbound one never freezes at all."* (The speed collapse at the end is two bounces off
> > other bodies at spec [01 · §10](./01-swing.md)'s 0.2 restitution, not the tether.)
> >
> > **How common, over the 26 dispatches that replay** — 222 captures, re-measured 2026-09-02:
> >
> > | | |
> > |---|---|
> > | captures that ever leave the grab range | **5 — 2.3%** |
> > | held ticks spent outside it | **1.6%** of 21 076 |
> > | furthest reached, as a fraction of the reach | p50 0.27 · p90 0.54 · p99 1.17 · **max 1.95** |
> >
> > **Nothing rules a maximum hold distance and this spec should not invent one.** Spec 01's physics
> > tolerance is scoped *"at every radius from the floor to the grab range"*, so past the reach the
> > behaviour is **undefined rather than permitted**; the **Cleared** ending already treats grab range
> > as the edge of a body's influence; and 2026-09-01's *"an unbound grab draws no predicted path…
> > they're rewarded for quick fly-bys and speed"* sharpens rather than contradicts this — a
> > five-second unbound hold is not a quick fly-by, it is a stall.
> >
> > **The cost of reopening it is stated, because it is what makes this a ruling and not a fix**: a
> > force-release changes what a tick does, `SIM_VERSION` 9 → 10, and all 26 replayable dispatches
> > refuse — including the ones the parked camera session is waiting on and the ones `K = 640` was
> > derived from. The three candidate predicates are release at `r > grabRange` flat, release only
> > when *also* receding, or refuse the press when the grab is unbound at the outset. The last is
> > cleanest physically and collides with spec [01 · §3](./01-swing.md)'s *"the choice is a fact
> > rather than a threshold."*
>
> **§6 · The hand ends on the outermost ring, not past it** (author, 2026-09-03). *"The white arm
> coming from the planet while orbiting should end on an orb. Right now it extends past the last orb
> and looks a bit odd."* The table's *"extended outward past the outermost ring"* is overruled: the
> overshoot was 12 board pixels — **36 design units of line with nothing drawn on it**, past the
> last thing the hand is *for*. Every other mark on the hand is a crossing, so the tail was the one
> stretch that said nothing, and a hand that stops on its last mark reads as pointing at a value
> rather than as a radius that ran out. `HAND_OVERSHOOT` is gone rather than zeroed, because it is
> ruled and not parked.
>
> **§6 · The rings sit two thirds as far apart** (author, 2026-09-03). *"Let's also reduce the
> distance between the compass rings, maybe 2/3 of what it is now."* `RING_MIN_GAP` is the constant
> that request is about and almost nothing else: measured over the 31 replayable dispatches — 15 099
> frames carrying a compass, 29 127 adjacent pairs — **80.5% of gaps sit exactly on it**, and the
> distance-proportional term speaks only for the other fifth. 16 board pixels → **11**, so the p50
> gap goes 48 → 33 design units. **The derivation survives**: two windows at full aim are 18 across
> and two crossing dots 15, so 33 still clears both — what is given up is air, not the rule.
>
> **§6 · The hand is dimmer, starts at the body's surface, and its crossings ramp.** Three notes on
> one screenshot (author, 2026-08-29). This section brightens the hand *"as aim closes"* and states
> neither end: it ran 0.35 → full CORE, which read as a bright bar across the middle of the
> instrument, and now runs 0.18 → 0.55. It is drawn from the body's **rim** outward rather than
> from its centre — the part inside the body was a line through the thing it measures from, and
> state 1's grab filament starts at the rim for the same reason. And the
> crossing dots take the window's ramp rather than the energy table's step, so the mark that says
> *the hand is here* brightens all the way in instead of jumping once.
>
> **§7 · The thumb line holds and is now load-bearing twice.** Sightings are pinned inside the
> design space and never cross it, which falls out of the geometry rather than being clamped.

> ## ⚠ Flown and built, 2026-08-29 — M2.4 spends three of this file's rows
>
> **§5 · HITSTOP is withdrawn and the row is void.** [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
> refused it and spec [02](./02-release.md) is now rebased off it. Nothing in the game
> time-scales, and no spec may assume a freeze exists. `CONTEXT.md` keeps the word so a reader who
> meets it in an older document knows it was decided against rather than forgotten.
>
> **§5 · KICK is the camera's share of the punch, and the word is *punch*.** The token's numbers
> stand — 6px along the exit tangent at a release, 3px reversed at a grab, home in 180ms with one
> overshoot — with one addition ADR-0012 requires: it is **scaled by the quality of the swing**,
> as √quality on the size and half again as long at the top of the envelope. `CONTEXT.md` spends
> *kick* under **punch**'s `_Avoid_` line, so this row's name is the one exception and it is
> flagged rather than renamed, because the boards print it.
>
> **§6 · The label row is retired** (author, 2026-08-29). This table put *"a chip at its window's
> tip"* on every ring and spec [04 · §5](./04-bodies.md) rules that an address chip appears in
> **exactly one case** — two live targets too close in hue to tell apart. One had to be stale and
> neither said which; **spec 04 §5 wins**. Measured over 29 777 pairs of rings drawn together in
> the author's own runs, two rings on one compass never come closer than **24.4°** in hue, so the
> tie the label would have resolved does not arise on the instrument. §6's 12° label-collision
> rule goes with it, and identity in the run stays hue-only.
>
> **§6 · The *Trail* row is renamed and given a job.** *"The arc of orbit already flown"* is now
> the **flown arc** (`CONTEXT.md`), because *trail* is spent on the craft's own line through the
> field, whose brightness is the carry — one word for two things is the fork AGENTS.md §2 exists
> to stop, and it is the same collision *ghost* had. It is no longer drawn at a flat E2: it is lit
> by what the **boost** was worth along it, which is spec 01 §7's envelope and the only element in
> the game that draws it. Ruled 2026-08-29, on the measurement that 34% of releases landed before
> the boost had armed. Spec [02](./02-release.md) carries the numbers.
>
> **§6 · Reachable is three rings, not four** (author, 2026-08-29): *"four is a bit unwieldy and
> makes it hard to decide where to go next."* The cohort that set the number prices the change
> exactly — over 342 releases that reached another body, the body actually grabbed next was among
> the **three** nearest 99.7% of the time against four's 100%, so the fourth ring is worth one
> release in 342 and costs a choice on every orbit. Two is 92.7% and is a different decision.
>
> **§6 · The five states' RELEASE row loses its hitstop and gains its word.** State 5 read *"E3
> flash, 70ms hitstop, exit streak along the tangent."* There is no hitstop and no E3 at a
> release; what is drawn is the punch, the craft's stretch, the farewell ring, and the taken
> window staying lit under the word that was earned. *"The compass resolves — it does not
> vanish"* is unchanged and is what its exit does.
>
> **§3 · The E3's slot is empty, and all three of its live users are withdrawn.** The row lists
> *"release, grab, award, the checkered line"*. M2.4 spent it on the award — PERFECT alone, at the
> dot — and the author flew that too: *"there's a weird white-ish blur circle that appears when I
> get 'perfect', in addition to the yellow one beneath the text. I don't like that white one."* The
> word already blooms in its own tier colour, so a CORE-white additive flash under a SOLAR word was
> two glows arguing about one instant — the same complaint the grab's flash got. **Nothing strikes
> an E3 today.** The step, its radius, its 400ms and the one-alive-at-a-time rule are all
> untouched, and what is left for them is the **checkered line at the crossing**, which is spec
> [12](./12-finish.md)'s and M6's.
>
> **§5 · KICK is void as well as renamed.** The row's numbers were built, flown and refused: *"we
> don't really want shake effects or pauses like that, it turns out that really disrupts the
> flow"* (author, 2026-08-29). This section's own *"the camera is never rotated, never shaken and
> never randomised"* now has **no exception in it** — spec 02 §5 argued a directional kick was
> exempt and flying settled that it is not. What the punch is spent on instead is the craft's own
> deformation, and spec [02 · §5](./02-release.md) carries it.
>
> **§6 · Two rings are never drawn at the same height.** The stack's radii are proportional to
> distance — 186 design units spread over an aim range of 2 400, so **one unit of radius per 12.9
> units of world** — which is finer than the stroke that draws them. Measured over **12 280
> adjacent ring pairs**, half sat under 5 design units apart on screen while their bodies were a
> median of **32** units apart in the world: *"two orbitals are sharing the same height on my
> compass. Were the planets really the same distance away?"* (author, 2026-08-29). They were not.
> A minimum separation is held whatever the windows are doing; below it the gap stops being
> proportional and says *these two are near each other*, and the **order** still says which is the
> nearer hop.
>
> **§6 · The grab filament's fade is recalibrated, not added.** It was already fading with
> distance and the span was wrong: measured over **40 tethered drifts**, a craft that grabs and
> floats away reaches **p50 0.36** of the body's reach and never past **0.71** — it cannot get
> further, because the thing it is drifting from is still pulling it back. A fade calibrated to
> the whole reach therefore spent a quarter of its range on the whole gesture. *"I felt that the
> tether line to the planet when moving away at the end should've gotten more faint as I pulled
> away"* (author, 2026-08-29). It now spends the whole fade across six tenths of the reach, so a
> long drift arrives at the floor instead of three-quarters of the way to it.
>
> **§7 · Every readable thing is held inside the design space, and that is now enforced rather
> than assumed.** *"Nothing the player reads is drawn outside it, ever"*, and *"the compass, the
> masthead and every award live above"* the thumb line — and M2.4's award word, born in world space
> at the dot, was being cut in half at the edge of the picture. It stays world-anchored; what is
> held is where it is drawn.

> ## ⚠ Built, 2026-08-30 — §7's width-fit lands, and it was the missing pace
>
> **§7's own ruling is built.** *"The width is the contract and the height flexes... the scale
> comes from the width — 1170 design units across, always"* (author, 2026-08-28) had been recorded
> as [M3.1](../plan/m3-the-field.md)'s and the build still fitted the rectangle **whole**. On a
> phone that fit is bound by the **height**, because browser chrome takes a bite the design space
> was authored without — so everything was drawn at the **77%** this section already names.
>
> **It was the whole of a complaint that read as physics.** Asked to look at how the prototype
> handles the same moment — *"it's quite zippy there"* — its source says its two settle knobs are
> both at 1.0 (`phaseRate`, its own *"headline feel knob"*, and `tightenFrac`), so it circularises
> completely and sweeps at true orbital rate, exactly as this repo did. Its circular speed at the
> floor converts to ours exactly. Measured live in the browser, its canvas draws **390 world units
> across the full viewport width**. It is not faster. It is bigger.
>
> | on the author's phone, 393 css | a settled orbit reads as |
> |---|---|
> | the prototype | **315** css px/s |
> | fitted whole — before | **242** css px/s |
> | fitted to the width — now | **316** css px/s |
>
> **The two match to within a third of a percent, and not one number in the simulation moved.**
> [`letterbox.ts`](../../src/render/letterbox.ts)'s header has predicted this since M1.4: *"it is
> not the same size in the hand as a build that sized itself to the viewport instead, and the M1
> gate is flying this one against a prototype that does the latter."*
>
> **The first of §7's two guardrails is built with it.** `GUARANTEED_BAND` is **0.77** of the
> design height — 1 950 units, measured from the author's own 393 × 651 viewport — and every device
> shows it in full; a shorter one is scaled down until it does. The thumb line at 1 688 sits inside
> it with room, which is what makes *"nothing readable below the thumb line"* keepable rather than
> merely stated.
>
> **The second is deliberately not built, and the reason is this section's own absolute.** A cap on
> the extra height, implemented as a scale, would zoom **in** on a tall device and crop the width —
> and *"1170 design units across, always"* is the one thing §7 does not bend. It is a statement
> about what is **drawn** rather than about the scale, and what to do with the space it refuses —
> bleed, or a bar — is a composition question. It stays M3.1's and is named in the code as unbuilt
> rather than forgotten.
>
> **What it cost:** the bleed either side falls from **179 design units to 3.5**. That is the right
> trade and it is the same slack spent differently — fitting whole left room across and spent it on
> extra field; fitting to the width spends it on drawing the world 1.3× larger everywhere.

> ## ⚠ Flown, 2026-08-30 — §5's orbit path waits for the turn it cannot predict
>
> **One oval, not two.** §5's *"as soon as an oval orbit is possible I want it to fade in"* was
> built as *from the moment gravity binds the craft*, and that is one tick too early:
> [`predictOrbit`](../../src/sim/orbit.ts) does not model the **clearance**'s remaining turn, so a
> dive that owes one is shown a much larger ellipse and then replaced by the real one. *"First when
> I grab I see a large oval at times, and then when I start diving in it switches. I don't think we
> should show that first one, it looks like it jumps aggressively to the smaller, second one"*
> (author).
>
> **And it was two faults wearing one coat.** The other is at the **freeze**, and it survived the
> first fix: `predictOrbit` did not cap its eccentricity where `freeze` does, so a dive whose
> natural ellipse is longer than `ECCENTRICITY_CAP` drew a thin oval right up to the freeze and
> then snapped to a fat one — measured on the shipped run, **84% of a radius in one tick**, on one
> capture in thirteen. The prediction now caps where the freeze caps, **and is re-sized to still
> pass through the craft**, because a capped ellipse the craft is outside of would be worse than
> the jump: the compass is drawn *on* the path being flown. The worst jump is now 16% and none
> exceeds 20%.
>
> Measured on the shipped run, the pre-clearance oval was drawn for **4 to 9 ticks** on each of
> twelve dives — long enough to register and far too short to read as a shape. The path now waits
> until the clearance has been paid, which leaves §5's own reading of the fade intact: *"what fades
> is a prediction firming up"*, with the one stretch where it was not firming up but being replaced
> taken out of it.

## 1 · Palette — eight names, eight meanings

Every colour in the game is one of these eight. Nothing is mixed, tinted or invented at
draw time except through the alpha and bloom rules below.

| Token | Hex | Meaning | May appear on |
|---|---|---|---|
| VOID | `#0A0814` | The sky | The sky, and nothing else |
| DUSK | `#6C64A6` | Structure, unlit | Rungs, rings at rest, spent bodies, secondary data |
| AURORA | `#9D6BFF` | Strange | Anomaly sky, black holes, farewell rings |
| ION | `#FF5FA2` | Risk | Boundary gradient and line, boundary motes, deadline track, fuel halo when low, burn trail |
| CORE | `#FFF4E0` | The player | Craft, trail, hand, TRUE callout type |
| LUMEN | `#7FE0A8` | Quality (mid) and sanctuary | SHARP callout type; the finish system (carpet, chevrons, checkered line, carpet dots) |
| SOLAR | `#FFC94A` | Quality (top) | PERFECT callout type and its `×N`; results-sheet headline |
| INK | `#EDEAF7` | Utility text at full strength | Data, labels, chips. Never blooms |

Derived surfaces, not palette entries:

- **Body fill** `#100C20`. Every body's disc. Never brighter than the craft.
- **True black** `#000000`. Permitted in exactly two places: the gaps between anomaly clouds,
  and the disc of a black hole. Nowhere else, so the anomaly reads deeper than ordinary space.

Two monopolies, both absolute:

- **ION in the world** is risk only — the boundary, the deadline track, low fuel, the burn
  trail. Nothing else in the world glows pink, so peripheral vision alone distinguishes
  "near bodies" from "near the end of the world".
- **LUMEN in the world** is the finish system only. Nothing else in the world is green.

Quality colours (LUMEN, SOLAR) live **only in type**. No body, ring, gauge, mote or terrain
feature ever wears them, except the finish system's LUMEN monopoly. Geometry and typography
never share the colour channel.

## 2 · Identity hues

A body's hue is its identity, is assigned once, and never changes for any reason.

Generated at `oklch(0.72 0.13 H)` — fixed lightness and chroma, so every identity is equally
loud. Neighbouring bodies (adjacent addresses) differ by **H ≥ 50°**.

Reserved hue windows, excluded from generation (oklch H of the reserved token, ±20°):

| Reserved | oklch H | Excluded window |
|---|---|---|
| SOLAR | 85.0 | 65.0 – 105.0 |
| LUMEN | 157.1 | 137.1 – 177.1 |
| AURORA | 295.5 | 275.5 – 315.5 |
| ION | 357.7 | 337.7 – 17.7 |

Additional hard stop: generated blues stop at **H = 265°**, short of AURORA.

Exemplar slots printed on the board: ember 55° · teal 170° · azure 215° · blue 265°.

One exception, by decree: **black holes wear AURORA**, because violet means the rules are
different here.

> **Open — the teal slot.** The board states both "greens sit at teal, ≥20° clear of LUMEN"
> and "teal 170°". LUMEN sits at oklch H 157.1, so the printed teal slot is 12.9° clear, not
> 20°. One of the two numbers is wrong and the board does not say which. Until it is ruled:
> generate from the ±20° windows above and treat the printed exemplars as illustration.
>
> **Flagged for the colour-vision sweep** (§2a), which will move these numbers anyway.

### 2a · Colour vision — a sweep, not yet a rule

**Flagged, 2026-08-27, for a dedicated pass.** Hue is this game's identity channel, and hue is the
one channel colour-vision deficiency compresses. The palette and the ≥50° separation rule above
were chosen for *distinguishability by a trichromat*, and have not been checked against anything
else.

What the sweep must check, when it runs:

| Surface | The risk |
|---|---|
| Identity hues | 40 hues at ≥50° oklch separation collapse toward two axes under deuteranopia and protanopia. The effective separation under simulation is what matters, not the nominal 50° |
| The callout ladder | CORE white → LUMEN green → SOLAR gold. Green-against-gold is the classic red-green confusion, and these are the words that say how well you flew |
| ION against identity | ION at oklch H 357.7 against the ember end of the identity band, in the fire band, where being wrong is expensive |
| LUMEN against identity | The finish system against jade and teal identities, at the moment the run is won |
| The reserved-window widths | ±20° may not be enough separation once simulated |

What already mitigates it, and must be preserved whatever the sweep concludes:

- **Brightness is the only ordinal channel** (§3). Quality never depends on hue alone — the tiers
  differ in type scale and bloom as well as colour, and every "better" in the game is *brighter*.
- **ION and LUMEN hold world monopolies** (§1), so risk and sanctuary are identifiable by
  *position and behaviour* — the boundary is at the boundary, the carpet is at the top — before
  colour is consulted.
- **The band multiplier is now labelled in the world** (spec [07](./07-boundary.md) §2), so the
  most expensive colour judgement in the game has a text fallback.
- **Body type is a glyph** (§6), not a hue, so the extension path is already non-chromatic.

The sweep may change palette values, the separation rule and the reserved windows. It may not
change the grammar: hue stays identity, brightness stays quality.

## 3 · Energy — the ordinal channel

Brightness is the only ordinal channel in the game. Nothing ever changes hue to mean "better".

| Step | Name | Bloom | Used by |
|---|---|---|---|
| E0 | STRUCTURE | none | Rungs, rings at rest, dust, spent bodies |
| E1 | LIT | 6px @ 35% | Active compass windows, body rims, labels |
| E2 | HOT | 18px @ 60% + white core | Craft baseline, a window under live aim, the dot when matched, a held body |
| E3 | FLASH | 48px, additive, 400ms decay | Release, grab, award, the checkered line at the crossing |

**Only one E3 may be alive at a time.** A new E3 replaces the old one; it does not stack.

**Chain adds bloom.** Each chain link adds **+4px** to the craft's E2 bloom radius. A hot run is
visibly hotter, in radius, never in hue.

## 4 · Type

| Role | Face | Weight | Notes |
|---|---|---|---|
| Display — velocity, mode titles, headline numbers | **Anton** | 400 | Tracked 0.03em. Masthead and cards only |
| Utility — data, labels, telemetry, chips | Archivo | 400–800 | Tracked caps do the instrument work |
| Callouts — TRUE / SHARP / PERFECT and their points | Archivo | 800 | Tracked 0.1em caps. Moving text needs open counters, so the display face is banned here (Direction 06) |

Nothing in the game is set in a monospace face.

## 5 · Motion

| Token | Value |
|---|---|
| ENTER | 120ms, `cubic-bezier(.2, 1.6, .3, 1)`, from 92% scale |
| DECAY | 420ms exponential |
| HITSTOP | 70ms world freeze, at grab and at release |
| KICK | Camera 6px along the exit tangent at release, home in 180ms with one overshoot; 3px reversed (into the orbit) at grab |
| Persistence | Nothing persists past 600ms except the trail |

Two rules govern everything that moves:

1. **Attack ≤ 2 frames; decay ≥ 10 × attack.** Things arrive; they do not fade in.
2. **All streaks are parallel to velocity.** Nothing radiates from a point, ever. The game is
   side-on and implies no depth.

The camera is never rotated, never shaken and never randomised. A shake would say "damage";
this game has no damage, only commitment.

## 6 · The compass

The compass is the coloured windows drawn on the orbit path around a body: where the craft will
go if it releases now, and how good that aim is before it does.

### Elements

| Element | Geometry | Energy |
|---|---|---|
| Rings at rest | One concentric ring per reachable body, centred on the held body | E0, DUSK |
| Window | An arc on the ring belonging to one reachable body, in that body's identity hue | E1 at rest, heating to E2 under live aim |
| Dot | The point at the centre of a window — a perfect release | E1 at rest, CORE white when matched |
| Hand | The radius through the craft, extended outward past the outermost ring ⚠ **overruled 2026-09-03 — it ends *on* the outermost ring, where its last crossing is** | E1, thickening and brightening as aim closes |
| Ghost | One dot per ring crossed by the hand; the active ring's is the brightest | E1–E2 |
| Trail | The arc of orbit already flown, on the orbit path | E2 |
| Label | A chip at its window's tip, on its own ring | INK on VOID at 88% |

### Behaviour

- **Window width encodes difficulty.** A narrow window is a harder release and, because the
  tier zones scale with the window (spec [06](./06-awards.md)), automatically a better-paid one.
  The arc's width is the posted odds.
- **A window's hue never changes.** It heats in place: E1 → E2 as the hand closes on the dot.
- **The gap between ghost and dot is the grade**, drawn on the geometry. It is a fact, never a
  command.
- **Labels never collide** because no two labels share a ring. If two window tips come within
  **12°**, the outer label slides along its own ring until clear.
- **The nose points along the exit tangent** for the whole orbit. The nose says *where*; the
  hand says *when*.

### The five states of one swing

| State | What is drawn |
|---|---|
| 1 · PRESS | The grab filament: a line from the craft to the body pulling hardest, in that body's identity hue. Its orbit fades in |
| 2 · ORBIT | Windows at E1, hand thin, crossing dots quiet. The instrument is at rest |
| 3 · CLOSING | Ghost approaches the dot; the hand thickens; the window under the hand heats toward E2 |
| 4 · MATCHED | Ghost and dot merge, CORE white. The player knows the tier before letting go |
| 5 · RELEASE | E3 flash, 70ms hitstop, exit streak along the tangent. The taken window stays lit and decays behind; the unused rings die instantly. The compass resolves — it does not vanish |

### Body-type glyphs

Body type is a glyph on the ring and its dot, matching the glyph the body itself wears
(spec [04](./04-bodies.md)). Standard: a plain dot. Binary: twin dots. Pulsar: a dot that beats.
Black hole: a hollow dot with an inner dashed echo. Ringed: a doubled ring line.

Only STANDARD ships in v1 (ADR-0005, plan/README). The glyph slot exists so that a later body
type is a data change, not a redesign of the instrument.

## 7 · Layout

The design space is **1170 × 2532** — a phone held in portrait (ADR-0010). Everything the player
reads is drawn in world space in design coordinates, and **nothing the player reads is drawn
outside it, ever**, so the composition is identical on every device. DOM is developer chrome only.

**The width is the contract and the height flexes** (author, 2026-08-28). The design space was
authored at the size of a whole phone screen and a browser never gives a page a whole phone screen,
so fitting the rectangle *whole* meant drawing everything at **77%** of the size the prototype
draws it at on the same phone. The scale therefore comes from the **width** — 1170 design units
across, always — and how much height a device shows follows from its own shape.

Two guardrails, because a flexing height is otherwise a game whose visible field is a property of
the hardware. Measured across plausible devices, the unguarded version shows between **496 and 846**
prototype units of height, and the body a craft next grabs is on screen at the moment of release
anywhere from **45% to 89%** of the time.

- **A guaranteed band.** A height, measured from the shortest viewport the game supports, that
  every device shows in full. **Everything the player reads is composed inside it**, and the rule
  above is unchanged in force — only the rectangle it names is now the band rather than the whole
  design space.
- **A cap on the extra.** A device tall enough to show more than the band does not get unbounded
  extra field, so what a player can see is bounded above as well as below.

**And the field of view this costs is bought back with sightings** (author, 2026-08-28) — spec
[03 · §6](./03-hud.md), a body the picture cannot show marked on the edge of it in its own hue.
That is the other half of this ruling rather than a separate feature: fixing the width takes the
body a craft next grabs off the picture at the moment of release **32%** of the time against 12%
when the rectangle is fitted whole, and a sighting is what that 32% reads instead. They arrive in
[M2.2](../plan/m2-the-instrument.md), before [M3.1](../plan/m3-the-field.md) changes the fit.

Both numbers are [M3.1](../plan/m3-the-field.md)'s to measure, along with the fit itself; what is
built today still fits the design space whole, and says so. The thumb line below was already
written against the *screen* rather than the design space, and this is the reading it always
implied.

**Outside it is bleed, not black.** The design space is fitted whole and centred; whatever the fit
leaves over is filled with world — 179 design units either side on ADR-0011's measured phone,
which is world the device could always draw and was painting over ([M1.4](../plan/m1-the-swing.md)).
How much of it a device shows depends on the device, and that is exactly why the rule above is
absolute: bleed is the world seen further, never part of the composition. It is bounded by the
corridor's line, because past that there is no world to show.

**The thumb line** sits at **2/3 of the screen height**. Nothing readable may live below it,
ever. The compass, the masthead and every award live above it.

## Acceptance

- Every colour drawn by the renderer resolves to one of the eight palette tokens, the body fill,
  or true black; a lint over the render layer finds no other literal.
- Generating 40 identity hues for one day yields no hue inside a reserved window, and no two
  adjacent addresses closer than 50°.
- Every ordinal distinction in the game survives converting the frame to greyscale: tiers, energies,
  bands and chain remain rankable. Identity does not, and is not expected to.
- Bloom radius is a pure function of energy step and chain length; no code path sets bloom from
  a hue.
- Two window tips placed 10° apart produce labels that do not overlap.
- At most one E3 is alive on any tick.

## Open

- The teal identity slot (§2).
- The colour-vision sweep (§2a) — flagged, not scheduled. It has authority over every hue value and
  every separation number in this spec, and none over the grammar.
