# 03 · The HUD — one layout, five pressures

**Board**: [Direction 03 — HUD Five Pressures](../design/Aphelion%2003%20-%20HUD%20Five%20Pressures.dc.html).

**Rulings applied**: the display face is **Anton** — this board contested it and Direction 06
settled it, so the board's Unbounded/Space Grotesk comparison is decided, not open. The board's
`P11` / `P12` / `P15` chips are retired; a body is named by hue in the run and address in the
retelling (Direction 04). The board's `+445 ON RELEASE` is a stale absolute from a superseded
scoring model — the behaviour survives, the number does not.

**Board that lost**: this board draws a `×3` multiplier label in the world next to the boundary
motes; [Direction 07](../design/Aphelion%2007%20-%20Boundary.dc.html) forbids it outright —
*"No multiplier labels in the world, no arrows, no 'RISK ZONE' text. The glimmer is the
signpost."*

**Author ruling, 2026-08-27 — Direction 07 lost.** In-world multipliers and boost labels are **in**:
*"I want to keep it arcade-like and obvious what rewards you."* The later board does not win this
one. The band carries its multiplier as a label in the world (spec [07](./07-boundary.md) §2), and
anything the field pays says what it pays, where it is.

**Depends on**: [00 · Tokens](./00-tokens.md), [13 · Fuel](./13-fuel.md), [07 · Boundary](./07-boundary.md).

---

> ## ⚠ Built, 2026-09-04 — the top band exists, and it was composed where a phone cannot see it
>
> **§1, §2 and §3 are built.** The velocity masthead in Anton top-left, its subline, `CHAIN ×N`, and
> the BANK chip top-right with the armed cash on a second line while a graded release is armed.
> Nothing in the band moves between the five pressures: what changes is one line's **content** and
> one chip's **brightness**, which is what makes §3's *"nothing moves between states"* a property of
> the composition rather than of a test. The chip's opacity is a pure function of engagement and of
> nothing else, which is this section's own acceptance criterion.
>
> **The layout is Direction 03's own, at its artboard's scale and not at the board pixel's.** That
> board is **330 × 715** and draws the whole phone — its thumb line sits at `y = 477`, two thirds of
> 715, which converts to within 0.2% of the thumb line this repo already has — so the factor is
> `1170 / 330`. `BOARD_PIXEL` is 3 and turns a **css pixel on the phone** into a design unit; these
> are two conversions of two different things and both are exact. Stated once in
> `src/render/hud.ts` rather than rediscovered.
>
> #### ⚠ It hung from the design space's top edge, and 291 design units of that are cropped
>
> Spec [00 · §7](./00-tokens.md) fixes the **width** and lets the height flex, so the fit scales from
> the width and any viewport shorter than the design space loses the same amount off both ends —
> measured on the author's own phone, **291 design units**. Hung from zero, the velocity landed at
> design `y` 184 and the BANK chip at 170: **neither was on screen**, and `CHAIN ×N` at 326 was the
> only line of the masthead that survived. Found by looking at it rather than by a test, which is
> worth recording as the reason.
>
> §7's own first guardrail is the fix and it is the sentence the rule was already written in: *"a
> guaranteed band... everything the player reads is composed inside it."* The band now hangs from
> the top of that rectangle with the board's offsets kept exactly. The **callout's clamp had the
> same bug and it was older** — it slid a word born near the top of the picture into the same strip.
> Both are asserted.
>
> #### The subline's three states, and one of them is a reading
>
> §2 names `M/S`, `M/S · RISING` and `M/S · TOWARD EDGE` and does not say when each is said.
> **TOWARD EDGE** wins and is gated on the boundary being *drawn*, which is the author's ruling of
> 2026-09-01 — a subline announcing the edge with nothing on screen would be the *"signal danger
> during normal gameplay"* that ruling refuses. ⚠ **RISING is a latch and it is derived, not ruled**:
> a coasting craft feels no gravity, so its speed is constant and the word is simply off, but a craft
> on an eccentric frozen orbit gains and loses speed twice a swing — an unlatched reading blinks. It
> holds for spec 00 §5's DECAY, 420ms, after the last tick that raised the speed.
>
> #### And the fuel coupling's number moved off this section's own view
>
> The *Fuel coupling* row's promise holds — *"by luminance, never geometry"* — and M4.4 turned out to
> be a statement about **layers**: the window's geometry is the picture's and its lit fraction is the
> **tank**'s, and the tank is the economy's, which is composed beside the picture rather than inside
> it. So `DeadlineView` carries the **closing speed** the price is a function of, and the fraction is
> computed where the two meet, in the renderer. ⚠ Nothing spends the tank on this build, so the
> fraction is 1 in play — see spec [13](./13-fuel.md)'s notice.

> ## ⚠ Flown, 2026-08-29 — the sighting points now
>
> **§6's central ruling is reversed by the author who made it.** On 2026-08-28: *"a sighting does
> not point"* — Direction 03's edge dot, position as direction, no vector, and `CONTEXT.md` listed
> *arrow* and *pointer* under `_Avoid_`. On 2026-08-29, having flown it: *"the coloured dots —
> personally I hate them. Let's instead re-design them to be arrows with distance markers, like in
> the original prototype"*, and on the maxim that forbade exactly that: **"this is another
> instance of an original rule being too strict."**
>
> So a sighting is an **arrow** in the body's identity hue with **how far away it is** beneath it.
> Concretely, against §6's table:
>
> - **Form** — an arrow, not a dot. Its *position* on the edge still carries the direction and the
>   arrow agrees with it rather than replacing it, so the two can never disagree.
> - **Distance** — carried, as a number. It is a **distance and not a name**: the author called
>   the labels *"a different class"* from the retired `P11` chips, and that retirement is
>   explicitly about naming, so identity stays hue-only. It is set in Archivo with tracked figures
>   rather than in the prototype's monospace, because spec [00 · §4](./00-tokens.md) rules that
>   nothing in the game is set in a monospace face.
> - **Reach** — §6 records *"reach is not yet a number"* and defers it to spec
>   [17](./17-daily-field.md). It has one meanwhile, carried from the prototype with the behaviour
>   it buys: past it the coast is long and featureless, and marking it *"invites the player to aim
>   past the interesting part of the field."* Spec 17 still replaces it.
> - **Distance, again, as brightness** — §6's own escape hatch is taken: *"stepping its energy is
>   the one answer that needs no label and breaks no rule."* A mark fades with range and is at
>   full strength for the body a press would take. The **step** stays E1; the fade is an alpha.
> - **The ring on the offered body** — §6 records it unbuilt and *"worth revisiting only after the
>   compass exists."* It exists, so it is built, and `BodyView` carries the fact from
>   [`bodyOnOffer`](../../src/sim/grab.ts) rather than working it out a second time.
>
> **The acceptance criterion below moves with it.** *"A sighting is held to the same line: its
> position carries the direction and no vector is drawn"* is superseded for sightings and holds
> everywhere else: no arrows in the world, no `RISK ZONE`, nothing that says *turn*. The line
> between a fact and a command is unchanged — a bearing and a distance are facts.
>
> **Everything else in §6 stands**, including the two rules that are the reason it exists: never
> for a body already on screen, and never for one behind the climb. A **spent** body is added to
> those, which §6 does not say and spec [04 · §3](./04-bodies.md) does — its lamp is out, and a
> sighting is that lamp seen from further away.

## 1 · The frame

Design space **1170 × 2532** (ADR-0010). Everything is drawn in world space in design
coordinates. The layout never changes between states; only the pressure does.

**The bottom third belongs to the thumb.** Nothing readable lives below y = 1688 (2/3 of 2532),
in any state, ever.

The top band holds **exactly two readables**: the velocity masthead and the BANK chip.

## 2 · The five readouts

| Readout | Position | Face | Behaviour |
|---|---|---|---|
| **Velocity** | Top-left, masthead | Anton, largest type in the game | The headline. Governs every grab, release and boundary call. Earns zero points (spec [08](./08-economy.md)). Digits pop to 120% on a release and settle in 180ms; the value never lies |
| **Velocity subline** | Under velocity | Archivo, tracked caps | States the current fact: `M/S`, `M/S · RISING`, `M/S · TOWARD EDGE`. ION when the subline is about the boundary |
| **Chain** | Under the subline | Archivo 600, tracked | `CHAIN ×N`. Also physically visible as the craft's bloom radius (+4px per link) |
| **BANK** | Top-right chip | Archivo 600, tracked | Dims to **55%** while coasting — earning nothing, losing nothing, a fact not a scold. While a graded release is armed it states the armed cash value on a second line |
| **Fuel** | On the craft | — | A halo arc around the craft that doubles as a light source. Not a corner gauge. See [13 · Fuel](./13-fuel.md) |

Awards are **not** in the HUD. They are drawn in world space at the compass dot that earned them
(spec [06](./06-awards.md)).

## 3 · The five pressures

One layout, five states. Nothing moves between states; only energy and content change.

| State | What changes |
|---|---|
| **1 · FREE FLIGHT** (coasting) | BANK at 55%. Bodies in range show a lit rim and a tide facing the craft. Off-screen bodies are screen-edge dots in identity hue — no labels, no collision handling. Fuel halo present |
| **2 · HELD** (the board calls this state CAPTURED) | The compass at rest: windows E1, hand thin, crossing dots quiet. The whole instrument sits above the thumb line. During a hold the thumb covers only trail the craft has already left. BANK at full |
| **3 · PEAK** (near release) | Hand closes on the dot; window E2; hand thick; ghost bright. Velocity heats to CORE. BANK states the armed value — a fact, not an instruction to release |
| **4 · BOUNDARY** | The ION gradient scales with **closing speed**, not proximity. Boundary motes glimmer in the outer bands, one per band **captioned with its multiplier** (spec [07](./07-boundary.md) §2). This board is where that label is drawn, and it is canonical for it. Fuel halo has gone ION. Velocity subline reads `M/S · TOWARD EDGE` in ION |
| **5 · ANOMALY** | **Nothing about the HUD changes.** The world changed, not the instruments. Chip backgrounds go true black so labels hold against the curtains |

## 4 · Severity states

One hue, three energies. The prototype's yellow-low / red-empty / red-skull ladder is retired:
yellow would add a fourth meaning to hue, and severity is ordinal, so it rides the energy channel
like everything else.

| Severity | Trigger | Presentation |
|---|---|---|
| LOW | Fuel ≤ 25% | Fuel halo is ION and breathes at **0.8Hz** with a soft outer ring. The percentage number is the label — no icon, no banner |
| EMPTY | Fuel = 0 | The halo hollows to DUSK structure — spent, like a taken body — while an ION ring strobes at **2Hz**. The craft itself never dims: the player stays the brightest thing alive |
| CRITICAL | On an out-of-field trajectory | The deadline track (§5), plus `SOS` in ION strobing at the craft at **2Hz** once the last press is missed, until the burn-up |

There is no skull. A skull judges; `SOS` states a fact.

## 5 · The deadline track

**The deadline is the compass inverted.** Green windows on orbits say *release here*; the ION
window on the craft's own projected line says *a press here still saves you*, and its dot is the
last press that can. Same window-and-dot grammar the player already reads — which also teaches
that the press is steering, before the first orbit ever forms.

| Property | Rule |
|---|---|
| Where | Along the craft's own projected line, in world space |
| When it appears | On a trajectory that leaves the field. It fades in over 300ms |
| The window | Drawn at its **true physical size**, always |
| The dot | At the far end of the window: the last press that can still save the run |
| Past the dot | The projected line goes **dashed** — the future thins out |
| Fuel coupling | **By luminance, never geometry.** Only the fraction of the window the tank can afford stays lit. Half a tank lights the early half; an empty tank shows the whole window in DUSK. A moment exists, and you cannot buy it |

> ## ⚠ Built, 2026-09-01 — on the **grab**, and three rows are not as written
>
> This section writes the deadline against spec [07 · §5](./07-boundary.md)'s **burn**, which is
> priced by fuel — so it waited on M4. **The author re-based it on the grab**: *"I want to have
> something visual on the field that tells me where I need to save myself by. If I grab after, or
> just don't grab, I'm heading for extinction."* A grab needs no fuel, so the instrument comes
> forward, and what M4.4 adds is the **luminance** and nothing else — which is what the Fuel coupling
> row already promises.
>
> - **The window is plural.** The saveable stretch has gaps in it: measured over 966 doomed drifts,
>   58% hold one window, **8% hold more than one** as a second body comes into range, and 34% hold
>   none. Every one is drawn (author) — drawing only the last would tell a player who *can* save that
>   the chance is still ahead of them.
> ### ⚠ Rebuilt as the window it always said it was, 2026-09-03
>
> > *"I want the deadline to look like the compass windows, because that's a familiar pattern. Take
> > a look at the original prototype."* … *"I also don't love our dark background for the deadline,
> > it's even harder to see what it is."* — author
>
> **This section asked for a window and what M3.4 built was a taper.** The first sentence above is
> *"same window-and-dot grammar the player already reads"* and the table has a **window** row; what
> shipped was one continuous stroke swelling from a 1.32-unit hairline at the far end to a lead-in
> at the cross, which has no window in it — so the one thing the player was meant to recognise was
> the one thing missing.
>
> It is now [`drawRing`](../../src/render/index.ts)'s two marks, at `drawRing`'s own two weights:
>
> | the compass | the deadline |
> |---|---|
> | the ring — the whole orbit, thin and even, 1 board px | the **line** — the whole projected path, 1 board px |
> | the window — where a release arrives well, 3 board px | the **window** — where a press still saves, 3 board px |
> | the dot — the best release | the dot — the last press that can |
>
> A **gap is absence** rather than a dimmer copy of the band, which is what makes the plural window
> read as plural. The prototype draws its own the same way — a variable-width ribbon in its hazard
> colour, with width carrying the meaning and no casing under it.
>
> **The plate is gone with it.** It went in on 2026-09-02 against a real measurement — at the line
> the cue loses 40% of its contrast — and it answered the contrast and cost the shape: dark edging
> either side of a 2.4-unit ink makes the *casing* the widest part of the mark, so *hard to see*
> became *hard to see what it is*. What replaces it is width: the window is 9 design units where the
> track was 2.4. ⚠ **Contrast ratio is a property of two colours and is unchanged by that** — a
> wider band is legible at a ratio a hairline is not, but nobody has measured the wide band against
> the wash the way the hairline was measured, and the test is a flight along the edge. If it is
> still lost there, the answer is more likely this table's own **luminance** row than a casing.
>
> **And spec 14 §3.1's open question closed with it.** The author ruled the hairline acceptable —
> *"not really noticeable, but I think that's OK"*, so a track is **structure** and 1 px binds — and
> the rework then removed the hairline entirely. `test/render/strokes.test.ts` now finds nothing at
> all between the two floors.
>
> ### ⚠ Gated to the edge on the third asking, 2026-09-04
>
> > *"The deadline is still a bit long. I kept seeing it in the playing field. Let's gate it so that
> > it only renders closer to the edge."* — after *"it's really long, impacting my normal playing
> > field"* (2026-09-01) and *"too long and crosses into the normal playfield"* (2026-09-03)
>
> **Twice this was answered with weight and twice it came back.** The hairline taper and then the
> window taper both kept the whole path on screen and only made its far end quiet; the third answer
> is the one that was asked for. A stretch of the path that is not within spec
> [07 · §2](./07-boundary.md)'s **outer band** of a wall is not in the view at all.
>
> **The axis is the sample's own distance to a wall, and the obvious axis is wrong.** Gating on
> where the *craft* is cuts **61% of the presses the author actually makes** at a 900-unit
> threshold, because the corridor is 2 223 wide and a craft on a leaving trajectory is already near
> a wall — measured, within 1 111 of one on every tick the cue is up, which is the centreline. What
> is long is the **path**.
>
> Measured over the corpus, the drawn length goes **p50 1 665 → 1 055** and p95 3 732 → 3 163, and
> **every live tick still draws something** — shortened and never silenced, which is the property
> the prototype's refused length-clamp did not have. ⚠ The p95 barely moves, because a path running
> nearly parallel to a wall stays inside the band for a long way; if that case is the one still
> being seen, the band is the knob and `FIRE_BAND` takes p50 to 444.
>
> It is `OUTER_BAND` rather than a number of its own because the deadline is a fact *about* the
> boundary, so the two instruments now agree about where risk starts.
>
> - **Past the dot is not dashed.** Refused with the dashes that were on spec 07's bands. The track
>   goes out and the SOS takes over: one predicate, two presentations. The spent part of the line is
>   history, and spec 05 §6 rules there are no breadcrumbs anywhere in this game.
> - **Fuel is a named zero in the shape of a full tank** — `affordable` is 1, so the whole window is
>   lit. Unlike a chain of zero, a constraint that does not exist yet is one that does not bind.
>
> **What it is worth is a prediction and not a fact**, and the word carries that: the condition is
> *no single press-and-hold from here turns the craft away*, and it does not consider releasing and
> grabbing a different body. The prototype measured its own at **95%** and named it `SOS` rather than
> `DOOMED` for exactly that reason.
>
> ### ⚠ *When it appears* is a little later than this row says, 2026-09-02
>
> The scan that finds the mark is now **spread across ticks** — the author's ruling from the
> grilling, *"every 3rd tick, spread over the fade-in"*, earned when the phone showed it as the most
> expensive thing in a tick. So the mark appears **3 ticks after the trajectory leaves the field at
> p50 and 4 at worst** (measured, 89 scans over the 27 replayable dispatches), and then fades in over
> the 300 ms this row states.
>
> **The fade-in is the bound rather than a coincidence**: a scan is at most 50 presses and a tick pays
> ten, so it lands well inside the 18 ticks the 300 ms is. Nothing was ever drawn during those ticks
> — the mark was being eased in from nothing — but the mark's **life is 10% shorter**, because a dot
> lands with a median 58 ticks of lead where full strength begins at 81, so the ticks lost at the
> front would have been fully lit ones.
>
> ⚠ **It was three presses a tick for a day and that cost 34% of the mark's life**, against a phone
> cost that turned out to have been over-read by about four times. `docs/plan/m3-the-field.md` carries
> the correction, the table and the alternatives.
>
> ### ⚠ The track sits on a plate now, 2026-09-02 — the ground was the same token
>
> > *"The deadline is hard to see against the ion background along the edge."* — author
>
> **Measured, and the cue's own token is what does it.** Spec [07 · §3](./07-boundary.md)'s wash is
> ION over VOID rising to α 0.6 at the line; this section's track is ION. At the line, full heat, the
> ground composites to `rgb(157, 60, 105)` and the track's lead-in to `rgb(159, 61, 107)` — **the same
> three numbers**. As a contrast ratio the lead-in falls from **2.48:1** in the open field to
> **1.53:1** at the line, and the track behind it from 1.36:1 to **1.22:1**. The instrument is
> faintest exactly where the decision it marks is.
>
> The answer is spec [00 · §6](./00-tokens.md)'s and it is the one §6's own `SOS` already took two
> days earlier: **darken the ground, do not change the ink.** A VOID plate is drawn under the track
> and under the dot, at the SOS plate's 0.82, following the ink's own width and its own fading — so a
> stretch drawn faintly because no press there saves does not get a full-strength shadow under it.
> **At the line the lead-in goes back to 2.50:1, and nothing changes in the open field.**
>
> **Raising the track's own alpha was measured against this and refused.** At `OVERALL` 1 the lead-in
> reaches 7.01:1 in the open field — which is the *"bright red line is not helpful"* this section's
> first notice already records the author refusing — and still only 2.25:1 at the line. A fix for this
> should remove the ground's influence rather than shout over it.
>
> **What it costs**, from `pnpm profile`'s census over the author's own cleared run: strokes go 50.2
> → **52.0** a frame at the mean and 87 → **115** at the worst, and **overdraw does not move at all**
> — 1.613 mean and 3.075 max, to three decimals, before and after. A 1px stroke paints no area, which
> is the same argument the rungs' own note makes: what grew is command volume and not fill.

Nothing on the track tells the player what to do. It states four facts and lets the player price
the trade.

## 6 · Sightings — the bodies the picture cannot show

A body outside the picture and within reach is drawn as a **mark on the edge of the picture in
its identity hue** — `CONTEXT.md`'s **sighting**. Direction 03 is canonical for the form and it is
a **dot, not an arrow**: the mark's *position* on the edge is the direction, so nothing has to
point. That is not a stylistic preference — an arrow is the instruction this spec's own acceptance
refuses, and a dot states the same fact without one.

No collision resolution between them; they may overlap.

| Property | Value | Kind |
|---|---|---|
| Form | A dot on the edge of the picture, in the body's **identity hue** | Direction 03 |
| Which bodies | Off the picture, ahead of the climb, and within reach | Direction 03 |
| Direction | The mark's position on the edge, never a drawn vector | Direction 03 |
| Distance | **Not carried.** Direction 03 rules no labels, and nothing replaces them | Direction 03 |
| Behind the climb | **Never drawn.** A mark below the craft points at somewhere it has already been, which is clutter and a suggestion to turn around | Carried |
| Already on screen | **Never drawn.** A mark pointing at a thing the player can see is clutter over the exact thing it was pointing at | Carried |
| When | **Always**, whether or not a body is held | Carried |

**They are how the game pays for a fixed width** (author, 2026-08-28). Spec
[00 · §7](./00-tokens.md) fixes the design *width* and lets the visible height flex, which buys a
full-size picture and costs field of view; sightings are what the lost view is replaced with, so
this section is not a decoration on §7's ruling but the other half of it.

**And they exist for the moments the compass cannot reach.** The compass needs an orbit, so it exists
only inside a swing; a sighting is the whole of what a coasting craft has to go on, and that is
exactly the long drift and the fast flyby — the moments when knowing where anything is matters most
(carried from the prototype, [ADR-0013](../adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)).
The [M1 gate measured the cost of not having them](../plan/m1-the-swing.md): over 877 releases that
reached another body, the body the craft next grabs is **outside the picture 12% of the time** as
the design space is fitted today, and **32%** under §7's ruled fit. A sighting is what that 32% has
to read instead.

**Two things the prototype has and this does not**, recorded with their evidence rather than left
to be re-derived — because the author's ask was *the role* and not the prototype's form: *"I don't
necessarily need the arrows and distances from the original; I was asserting that markers to
objects off-screen is the way we deal with the information loss of fixing the width"*
(2026-08-28). Direction 03's dot in identity hue is a complete answer to that, and it is what is
built.

- **Distance.** The prototype fades a marker with range — full strength at 200 units, a floor at
  1 600 — and prints the number beside it. Direction 03 refuses the label, and the fade has no
  replacement here: **brightness is the game's only ordinal channel** (spec
  [00 · §3](./00-tokens.md)) and hue is already spent on identity, so if a sighting ever needs to
  say how far, stepping its energy is the one answer that needs no label and breaks no rule. It
  says nothing about distance today, at a flat E1.
- **The body a press would take.** The prototype rings that one at full strength and **keeps the
  ring when the body comes into view**, moving it from the edge onto the body — *"the cue must not
  blink out at the moment the thing it points at comes into view, because that is exactly when the
  player is deciding."* Its evidence is a measured session: the craft was inside the grab window
  for **1.03s** and could see the body itself for **0.23s** of that. It is a fact about what the
  button would do rather than an instruction, so nothing refuses it — but the compass is about to
  be built over the same question, and this is worth revisiting once it exists rather than before.

**Reach is not yet a number.** *"Within reach"* is Direction 03's phrase and the prototype carries
an explicit range beyond which nothing is marked. What it should be here is spec
[17](./17-daily-field.md)'s to fix once a day has a length, and until then a sighting is drawn for
every body ahead.

## Acceptance

- A screenshot of any of the five states, with the bottom third masked, loses no readable
  element.
- The top band contains exactly two readable elements in every state.
- The BANK chip's opacity is a pure function of engagement; toggling coasting toggles it and
  nothing else.
- Each boundary band in frame shows exactly one multiplier label, captioning a mote.
- No **instruction** text — arrows, `RISK ZONE`, `TURN` — is drawn anywhere in the world. A label that states what a band pays is a fact; a label that tells the player what to do is not. **A sighting is held to the same line**: its position carries the direction and no vector is drawn, and none is drawn below the craft.
- The deadline window's drawn length is independent of fuel; only its lit fraction depends on
  fuel. A test at 0%, 50% and 100% fuel finds three identical geometries and three different lit
  fractions.
- Entering an anomaly changes zero HUD properties other than chip background colour.
- A body on screen has no sighting, and one behind the climb has none; the count of sightings is a
  pure function of the bodies, the camera and what the picture can show.
