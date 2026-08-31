# 02 · The release — 400ms

**Board**: [Direction 02 — Release Storyboard](../design/Aphelion%2002%20-%20Release%20Storyboard.dc.html).

**Rulings applied**: the board's award words (DEADEYE / SHAVED / CLEAN) are retired — the
vocabulary is TRUE / SHARP / PERFECT plus an unnamed make (Direction 06 rev 2). The board's
`+445` is a stale illustration from a superseded scoring model and is carried nowhere. The award
word is set in **Archivo 800**, not the board's display face (Direction 06). The board's `P11`
chips are retired. The board's "NEXT, IN ORDER" footer uses obsolete numbering and is void.

**Depends on**: [00 · Tokens](./00-tokens.md) for energies and motion, [06 · Awards](./06-awards.md)
for what word is chosen, [08 · Economy](./08-economy.md) for what is cashed.

---

> ## ⚠ Rebased in M2.4, 2026-08-29 — the hitstop is spent and the timeline is dated from `T0`
>
> **The notice this file used to carry has been spent.**
> [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md) withdrew the 70ms hitstop the timeline
> was dated from — flown in the prototype, *"even a 30ms stop made it feel like the game was
> buffering"* — and this is the edit it named. Rule 1 is withdrawn; every `T+70ms` in §2 and §3 is
> now `T0`; the award word moves to `T+20ms`; §7's grab hitstop is gone; and the acceptance
> criterion about hitstop advancing zero world state has gone with it. **The exit-tangent rule,
> the award-lands-at-the-dot rule, and every duration measured from the start of its own element
> are untouched** — they were never the freeze, and the body of this file below is what it always
> said with those four changes made in place.
>
> **There is no freeze anywhere in the build**, and a phone run confirmed it from the other side.
> `diagnostics/2026-08-29T23-53-31-915Z-run-dispatch.json`, flown against the complaint *"I kept
> feeling some kind of lag or freeze on release"*: **all eight presses in that run land on one of
> the twelve worst frames, at +0 ticks, and not one release does.** Every one of them costs
> 19 – 27ms at a cpu of 0 – 1ms, so nothing in the game is doing the work — it is the browser's
> touch-begin, which [the performance write-up](../plan/performance.md) §10 has now recorded six
> runs running. It reads as belonging to the release because the next press follows one 13 – 35
> ticks later, and the release is the moment the eye is waiting on.
>
> **One real delay was found and removed, and it was the camera's.** It carried the orbit's hold
> after a release and decayed it at 5% a tick: measured over the recorded dispatches, **41 ticks
> at p50 and up to 104** before it was shed, walking the view **356 design units** away from a
> craft accelerating in the other direction. The view now lets go on the same tick the craft does,
> and `test/state/camera.test.ts` asserts the shape rather than a rate — with no body held there
> is no displacement at all — so there is no number left to tune it back up with.

> ## ⚠ Built, 2026-08-29 — and the boost envelope finally has an element
>
> **§6 gains the flown arc, and it is the one thing in this file that is not a rebase.** Spec
> [01 · §7](./01-swing.md)'s boost envelope runs on a clock from the freeze and **nothing on
> screen drew it**, which made spec [01 · §11](./01-swing.md)'s whole tension half-visible: the
> compass draws the aim in detail and the timing was invisible. Measured over the author's own
> flying, 83 converted releases across seven dispatches:
>
> | where the release fell | count | share |
> |---|---|---|
> | before the boost had armed | 28 | **34%** |
> | inside the plateau | 28 | 34% |
> | while it was decaying | 25 | 30% |
> | after it was gone entirely | 2 | 2% |
>
> Hold since the freeze ran p10 **5** ticks, p50 **54**, p90 **91** and max **303**, against an
> envelope that is zero from 156 — the 303 being the swing reported as *"I felt that I slowed down
> a LOT in the orbit."* It was not a bug: `v / circular = 1.000000` at all 302 settled ticks. It
> was 147 ticks of holding against nothing, with no way to see it.
>
> **Ruled 2026-08-29: it is said on the orbit path.** The arc the craft has already flown is lit
> by what a release along it would have been worth — dim while arming, brightest across the
> plateau, dying behind the craft. Time runs along the arc, so it is a strip chart the orbit was
> already drawing, and the bright end is at the craft, where the eye already is. Measured, **the
> plateau covers 0.45 of a revolution** at p50 over the 27 orbits that reached its end — spec 01
> §11's own 43%, arriving from the picture's side — so both halves of the tension now sit on one
> circle. `CONTEXT.md` gains **flown arc**, because the compass's *"trail"* and the craft's line
> through the field were one word for two things.
>
> **The light is the envelope's own value and is measured against it.** Two of the three corners
> are closed-form: the plateau ends exactly where the settle does, and everything after it is one
> multiplication. The ramp falls inside the settle and is latched a tick at a time — shading it
> evenly along the arc instead is wrong by **0.19** of the range and wrong in the direction that
> says *the boost armed sooner than it did*, which is the exact error the element exists to
> remove. As built, the light is within **0.037** of the envelope at every one of 78 840 sampled
> points.
>
> **And a bug had to go first.** `swept` read `orbit.phase`, which stops advancing at the end of
> the settle because that is the datum the closed form is measured from — so the drawn arc froze
> at 1.2s while the craft kept going round it, and the one-turn cap it carried could never fire.
> `sweptSince` is what to ask instead.

> ## ⚠ Flown, 2026-08-29 — the E3 goes, and it comes back as the word
>
> **The flash is withdrawn at both ends.** §2's `E3 flash` row and §7's `E3: Yes, at the grab
> point` are both off (author, 2026-08-29): *"the white dot that is emitted when I grab is too
> noisy and too much... let's let the PLANET speak about our grab, not some ambient glowing
> orbs."* Spec [04 · §3](./04-bodies.md) already had the body doing that job — a held body is E2
> and alive — so the flash was a second voice on the same beat.
>
> **What spends the slot instead is the award**, which is what the author named as the thing that
> should fill the quiet: *"in future milestones we need to add both the boost, the point rewards,
> and maybe even a planetary pulse/farewell ring."* Spec [06 · §2](./06-awards.md) gives
> **PERFECT** — and PERFECT alone — energy E3, so the rarest word in the game is the only thing
> that strikes one, at the dot it was earned on.
>
> **§4's stretch is built, dated from `T0`**, and two divergences from the board's keyframes are
> worth stating. Both axes return on **one** rebound shape rather than two, because spec
> [00 · §5](./00-tokens.md)'s motion tokens are one grammar: the along axis matches the board's
> 0.95 against a 1.5 stretch exactly, and the across axis rebounds to **1.03** where the board
> draws 1.06. And the rebound is deepest **58%** of the way home where the board puts it at 83% —
> four hand-set keyframes are not a curve, and the depth is the half worth matching.
>
> **§5's punch is built, and the conflict in it is resolved rather than avoided.** The punch
> travels along the exit tangent, so it has a horizontal component, and
> [`camera.ts`](../../src/state/camera.ts) does not move sideways until
> [M3.1](../plan/m3-the-field.md). Both are right: the punch is a **displacement from** the
> camera's position rather than a second opinion about where the camera is, and the centreline
> assertion is now about the camera's **subject**. Nothing else in the game may take the view off
> that line.

> ## ⚠ Flown the same evening, 2026-08-29 — the punch comes off the camera
>
> **§5's displacement is withdrawn.** It was built exactly as this file wrote it — 6px along the
> exit tangent, home in 180ms with one overshoot — and the author flew it: *"I still feel a brief
> pause or shake at release, we don't want that... we don't really want shake effects or pauses
> like that, it turns out that really disrupts the flow."*
>
> That is the same shape of finding the hitstop got, one element along, and this file half-predicted
> it. §5 argued that a **directional** kick says departure where a shake says damage, and that spec
> [00 · §5](./00-tokens.md)'s *"never shaken"* therefore did not reach it. Flown, the distinction did
> not survive: moving the whole world moves the whole world, whichever way it goes.
>
> **The punch is spent on the craft instead**, on §4's stretch — the one element in the sequence
> that is already about the craft leaving. Quality now decides **how much of that stretch a release
> earns and how long it takes coming home**, which is ADR-0012's *"as size and as duration"* with
> the world left alone. The amplitudes at full quality are §4's own and are unchanged, so a good
> release looks exactly as it did; what moved is what a poor one does. §5 below is rewritten
> around that, and `camera.ts` is back to a rule with no exception in it.
>
> **The E3 goes too, and with it the last of spec 00 §3's four users.** M2.4 spent the slot on the
> award, at the dot, under the word — and: *"there's a weird white-ish blur circle that appears
> when I get 'perfect', in addition to the yellow one beneath the text. I don't like that white
> one, let's remove it. The text plus its own blur/glow and pop-up effect should be enough."* The
> word already blooms in its own tier colour (spec [06 · §4](./06-awards.md)'s 12px at PERFECT), so
> a CORE-white additive flash under a SOLAR word was two glows arguing about one instant — the
> same complaint the grab's flash got. **Nothing strikes an E3 now.** The slot stays for spec
> [12](./12-finish.md)'s checkered line.
>
> **The taken window gets its own clock back.** §6 gives it **420ms** and spec 06 §4 gives the word
> 1 720ms; built as one unit they were built on one clock, and the arc hung on screen four times
> longer than this file allows — *"the planet's compass window stays after the rest of the compass
> disappears."* They arrive together and leave apart: the word is the verdict, meant to be read and
> left behind; the arc is the last of the instrument and goes when the instrument does.
>
> **And the word is held inside the picture.** Spec [00 · §7](./00-tokens.md) is absolute —
> *"nothing the player reads is drawn outside it, ever"*, and *"every award"* lives above the thumb
> line — and a word born at a dot near the edge was being cut in half. It stays world-anchored;
> the clamp only bites on the ticks it would otherwise be off the page.
>
> **The word's own bloom goes too, and the prototype supplies what replaces it.** *"The blur circle
> behind the popup text isn't doing us any favours, it's blurring the legibility. We should remove
> it."* Spec [06 · §4](./06-awards.md)'s per-tier bloom is withdrawn; what keeps the type readable
> over a planet is a **rim** — a thin dark stroke around the letters, in VOID rather than black,
> because *"a heavy black outline under pale text reads as a sticker"* (the prototype's own comment
> on its own rim). Carried as a behaviour: the mechanism is ours.
>
> **And the pop becomes a throw**, on the author's instruction to go and look: *"I think the popups
> should pop upwards a bit more, mimicking the physics feeling that we have in the original
> prototype."* What the prototype does is not a pop — the word **rises across its whole life** on
> `1 − (1 − u)²`, *"so the popup leaves the ship promptly and then hangs where it can be read"*. So
> spec 06 §4's *"120ms upward, ~30px, one overshoot"* is superseded: it climbs 34 prototype units
> (102 design), fastest at birth, and never comes back down. **An overshoot is a spring and this is
> a throw** — which is the same distinction §5 above just lost the camera over.
>
> **One thing was raised and is already true.** *"I feel like the player should still get award text
> if they grab after the planet dot on the compass, but still in the window."* It does: spec 06 §2
> grades on the **absolute** offset from the window's centre, so both sides pay the same. Measured
> over the recorded dispatches, **40 graded releases fell short of the dot and 50 past it**, and
> every ungraded one was genuinely outside its window — the nearest by 12% of a half-width. Pinned
> in `test/state/goldens.test.ts` so it cannot quietly become one-sided.

> ## ⚠ Flown again, 2026-08-29 — the punch gets its speed, and §6 loses its ring
>
> **The transient is built at last, and it is the half of ADR-0012 nothing had.** Spec
> [01 · §8](./01-swing.md) has measured it since M1.1 — *"×1.8 on release, decaying linearly to
> nothing over 1.3s"*, the 78% of the boost a release does **not** keep — and this repo had only
> ever applied the 22% that is kept. Asked for after flying M2.4: *"both a good capture and a good
> release should provide a small kick to the ship's velocity, that fades after a bit, scaled by the
> quality."*
>
> **It runs along the exit tangent, so it does not bend the ray.** That is the thing that looked
> like it would forbid it: spec [01 · §11](./01-swing.md) rests the compass's closed form on drift
> being a straight line. A burst that scales a velocity rather than adding to one leaves the
> heading exactly alone — same ray, same bodies reachable, same route — and moves only **when** the
> craft gets there. Measured at the median exit speed, a body 700 design units out arrives in 0.43s
> against 0.72s.
>
> **0.45 and not 0.8**, which is spec 01 §8's measurement scaled back on the author's word: *"all
> of the velocity kicks are a bit too intense, let's scale them back a touch."* The prototype's
> figure stays a measurement of the prototype. It is the first slider on the bench.
>
> **`SIM_VERSION` is 4 and every dispatch recorded before it is refused.** That is the cost, paid
> deliberately: the alternative was flying the gate on a game the specs describe and the build did
> not have. The shipped recipe is regenerated, on a new seed — the old one now leaves the field
> after eleven edges.
>
> **§6's farewell ring is withdrawn.** Built and flown: *"when I release mid-circularisation, the
> oval of the orbit I'm on turns a bit purple and expands a bit. Let's remove that
> functionality."* It was the ellipse actually ridden, at the shape it had on the tick of release,
> which mid-settle is an oval — so what the author describes is the element working exactly as this
> file specified it. `CONTEXT.md` keeps the word and marks it refused.
>
> **And two on the word.** It is **left where it lands**: the clamp that keeps it inside the
> picture now runs at **birth only**, because applied every tick it slid the word up the screen as
> the camera climbed — *"it's OK to leave the text where it lands, it should be a marker left
> behind at the point of scoring"*, which is spec [06 · §4](./06-awards.md)'s own world-anchoring.
> And it climbs further: 50 prototype units against the 34 that codebase uses, for *"a classic
> 'ka-ching' money effect"*. The curve is still carried; the amplitude is this game's.
>
> **A make still says nothing, and that is now a known gap rather than an oversight.** *"I released
> what I thought was within the planet window and I got no text accolade for it. Do we need to add
> another text tier?"* Measured on that run, four of its seven graded releases were makes — so more
> than half of what the player got right was silent. **No new tier**: spec 06 §1 refuses a fourth
> word outright, and spec 06 §2 already gives a make *"points only"*. What is missing is the
> **number**, and the number is spec [08](./08-economy.md)'s and M4's. A CORE dot was tried as a
> stand-in and withdrawn the same evening — *"there's some small white dot being left behind at
> times"* — because a stand-in that reads as debris is worse than the silence it fills.

## 1 · The two rules

1. **Every motion is strictly along the exit tangent** — the line the nose has been pointing down
   all orbit. Never radial, never a shake. A shake would say damage; this game has no damage, only
   commitment.
2. **The award word lands at the dot that earned it**, not in a band at the top of the screen.

> The third rule was *"a 70ms hitstop where only the player's energy stays lit — the pause is the
> punch."* It is **withdrawn** (ADR-0012): flown in the prototype it read as buffering at every
> length down to 30ms. The punch is bought with speed instead, and it is §5.

## 2 · Timeline

`T0` is the tick on which the release input is registered. All times are **simulated** time and
ticks are the only clock (ADR-0006); nothing in this sequence time-scales, and no spec may assume
a freeze exists.

| Element | Starts | Ends | Notes |
|---|---|---|---|
| Craft deformation | T0 | T+180ms | See §4 |
| The punch | T0 | T+180ms | Spent on the craft's own stretch, scaled by quality. See §5 |
| The taken window | T0 | T+420ms | Stays lit and decays where it was earned. Unused rings die instantly |
| Award word | T+20ms | T+1 740ms | Pop, linger, then decay. See spec [06 · §4](./06-awards.md) |
| Its bloom | T+20ms | with the word | 5 / 8 / 12px in the tier's own colour. **No E3** — withdrawn 2026-08-29 |

**Everything except the word is over by T+420ms.** The word outlives it, and that is the one place
this file and spec [06](./06-awards.md) could not both be right:

> **The word's end column moved, and here is why.** This table used to end it at `T+510ms`, and
> spec [06 · §4](./06-awards.md) gives it a 120ms pop, a *"~1.2s"* linger and a 400ms decay — which
> is **1 720ms** — and then cites this file for the 510. They were never consistent. The rule that
> settles it is the rebase's own: **every duration measured from the start of its own element is
> untouched**, and pop, linger and decay are exactly that. So spec 06 §4's durations stand and this
> column is what they sum to.
>
> What keeps spec [00 · §5](./00-tokens.md)'s *"nothing persists past 600ms except the trail"* true
> is spec 06 §4's own next line: after its pop the word is **world-anchored**, so what happens to
> it after 600ms is that the world carries it away. The persistence rule is about motion, and a
> word being left behind is not moving. **The linger is on the bench**, because that reading is the
> author's to confirm and 1.2s is long enough to still be lit when the next swing starts.

## 3 · Frame by frame

| Frame | What is true |
|---|---|
| **T−80 · MATCHED** | The hand lies on the dot; the window is E2. The player already knows the tier. Peak tension |
| **T0 · IMPULSE** | The craft leaves along its nose, deformed by what the swing was worth — 1.5 / 0.7 ⚠ **1.75 / 0.55** at full quality — and **faster than it will be a moment later** (spec [01 · §8](./01-swing.md)'s transient). Unused rings die instantly; the taken window stays lit. **The camera does not move** |
| **T+20 · CONFIRM** | The word blooms at the dot that earned it, in its own tier colour |
| **T+180 · RIDE** | The word rides its pop out on the dot while the craft runs. The stretch arrives home, past rest once. The trail is a solid luminous line — no breadcrumbs |
| **T+400 · SETTLED** | Quiet. The body is DUSK, the ring is gone, the compass has left. The word is still lit and being left behind. The only permanent change is chain +1, so the craft's bloom is 4px wider than an orbit ago |

## 4 · Craft deformation

> ## ⚠ Half again as deep, 2026-08-30 — the punch wanted more punch
>
> **T0 is now 1.75 / 0.55**, and the overshoot with it. The author: *"let's make the kick boost a
> bit more punchy at the start. So not really changing the overall trajectory/velocity, but making
> it feel more rewarding"* — the second half of a note they filed the same day and asked to be kept
> (*"the 'kick' after release should be punchier, more like the original prototype"*).
>
> **The constraint chose the channel.** ADR-0012 spends the punch in two places: this, which is how
> a release looks, and spec [01 · §8](./01-swing.md)'s transient, which is how it flies.
> *"Not really changing the overall trajectory/velocity"* rules the transient out — and rules it out
> twice, because the transient lives in the simulation and moving it would cost a `SIM_VERSION` bump
> and refuse every recipe recorded so far.
>
> **What moved is depth, not attack.** The recovery curve already sheds 41% of the displacement in
> the first tenth of its span, so the start was already sharp; what there was not enough of was
> amplitude, and the repo had never flown this above the 1.5 below. The displacement from rest goes
> 0.5 → 0.75 along and 0.3 → 0.45 across, so the **5 : 3 ratio between the two axes is exactly the
> one the board drew** and one factor moved rather than two numbers.
>
> **The overshoot follows it** rather than being restated: the row below reads 0.95 against a 1.5
> stretch, which is *a tenth of the displacement*, and a tenth of 0.75 is 0.925. The fraction is the
> rule and the number was its reading at the old amplitude — `test/state/presentation.test.ts`
> asserts the fraction now, so the two can never disagree again.
>
> **When to reopen**: it is a taste number on the bench and has moved once. What it must keep is the
> ratio and the fraction above, both of which are the board's.

Stretch is always along the velocity vector. Never along a screen axis, never around a centre.

**It carries the punch** (§5), so the amplitudes below are what a release at the top of its
envelope earns; a release that earned nothing takes 0.45 of them, and never none.

| Time | Scale (along velocity / across) |
|---|---|
| Rest | 1.0 / 1.0 |
| T0 | 1.5 / 0.7 ⚠ **now 1.75 / 0.55** |
| T+150 | 0.95 / 1.03 (the overshoot, deepest 58% of the way home) ⚠ **0.925 / 1.045** — a tenth of the displacement, which is the rule the 0.95 was a reading of |
| T+180 | 1.0 / 1.0 |

The craft silhouette is a dart and is a stand-in. A signature craft shape is its own exploration,
queued behind the systems settling; nothing in the game may depend on the current outline.

## 5 · The punch

`CONTEXT.md`'s **punch**, and what replaced the hitstop (ADR-0012). It is transient and carries
none of itself into velocity, which is what lets it be large: *"a player tapping beside bodies gets
the punch and keeps none of it, while a player flying well gets the punch **and** the boost
underneath it."* What a run is worth is untouched by how good it felt.

**It is felt in two places, and neither of them is the camera.** §4's stretch carries how the
release *looks*, and spec [01 · §8](./01-swing.md)'s transient carries how it *flies* — a burst of
speed along the exit tangent that decays linearly to nothing. Quality scales both, on one pair of
curves:

| | Value |
|---|---|
| Amplitude at full quality | §4's own — **1.5 / 0.7**, unchanged |
| Amplitude at no quality | **0.45** of it, and never zero: the craft still left |
| Return | **180ms × (1 + ½ quality)**, one overshoot |
| Speed at full quality | **+45%**, decaying linearly to nothing over 1.3s × (1 + ½ quality) |
| At a grab | **Nothing.** Grabs are never graded (spec [06 · §1](./06-awards.md)) |

**Quality enters twice, and the second channel is deliberately the gentler one.** A release at the
top of its envelope holds its punch half again as long as a scraped one: strength is the punch,
duration is how far it carries. Quality is spec [01 · §7](./01-swing.md)'s envelope for a swing
that froze an orbit and ADR-0012's bend for one that did not, and there is **only one definition of
it**.

**The strength is a square root, and that is measured rather than chosen.** Applied linearly, the
prototype's median recorded release paid 29% of full and read as nothing happening; √0.29 is 0.54.
The curve lifts weak releases, leaves the top where it was, and cannot lift a tap, because it
cannot lift zero.

**The floor is not zero, and it is a different thing from the boost paying nothing.** A tap has no
arc behind it and earns no boost — that is structural and stays true — but the craft still left,
and the stretch is what says so. At zero the release of a swing that never armed would be
indistinguishable from no release at all.

> **The camera does not move.** This section used to displace the view 6px along the exit tangent
> and 3px reversed at a grab. Flown, it read as a shake and was withdrawn (see the notice above).
> Spec [00 · §5](./00-tokens.md)'s *"the camera is never rotated, never shaken and never
> randomised"* now has no exception in it, and `test/state/camera.test.ts` asserts the centreline
> on every tick of every swing with nothing carved out.

## 6 · What the release does to the world

- **Unused rings die instantly** at T0 — no fade.
- **The taken window stays lit** and decays where it was earned, over **420ms** — its own clock,
  a quarter of the word's, and carried by the callout rather than by a compass that has already
  left.
- **The held body goes DUSK at release**, not at grab (spec [04](./04-bodies.md)).
- **There is no farewell ring.** It was specified here, built, flown and refused (see the notice
  above). AURORA has no wearer in the baseline field.
- **The flown arc stops being a clock.** Through the swing it is lit by what the boost was worth
  along it (`CONTEXT.md`: flown arc); at the release there is no envelope left to read, so it
  falls to its floor and is carried out with the instrument. It never goes dark, because it is
  still the orbit that was flown.
- **The trail is a solid luminous line.** Its brightness is the carry (spec
  [08](./08-economy.md)). There are no sampled breadcrumbs.

## 7 · Grab

Grab is the release's mirror and shares its grammar, at lower amplitude:

| Element | Value |
|---|---|
| The punch | **None.** The camera's 3px was withdrawn with the release's, and a grab does not deform the craft |
| E3 | **None.** Withdrawn 2026-08-29 — the body itself is E2 and alive, and the flash was a second voice on the same beat |
| Award | None. Grabs are never graded; only releases are |

## Acceptance

- Presentation state at tick `n` is a pure function of `(recipe, n)` (ADR-0006). An agent with no
  canvas can assert that the view is displaced 6px along the tangent at a given tick.
- No element of the release sequence is alive at T+400ms except the trail and the award word,
  which spec [06 · §4](./06-awards.md) times and §2 above explains.
- Every motion vector in the sequence is parallel or antiparallel to the exit tangent. A test
  that projects each onto the tangent normal finds zero.
- **The camera is on the centreline on every tick of every swing**, with nothing carved out of the
  rule.
- **Every readable thing in the sequence is drawn inside the design space and above the thumb
  line** (spec 00 §7), on every tick it is drawn at all.
- **The flown arc's light is the boost envelope's own value**, within 0.05 of it at every point,
  and it is read from the same function the simulation pays on rather than from a second one.
- Deleting the economy (ZEN, spec [08](./08-economy.md)) removes the points but leaves every
  timing in this file unchanged.
