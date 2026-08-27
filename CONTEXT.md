# Aphelion

A game about swinging a spacecraft through gravity, where the only thing you do is
decide when to let go. This file is the project's glossary: one canonical word per
concept, so that the vision document, the design directions and the code all say the
same thing. It contains no implementation detail and no numbers that could drift.

Where the sources disagree, the ruling is recorded here and the losing word is listed
under _Avoid_. `docs/VISION.md` says what the game is for; `docs/design/` shows what it
looks like; `docs/spec/` says how it must behave.

## The world

**Field**:
The whole world of a single run — one climb with a top. Its shape is not fixed: a
vertical corridor today, a ring or an authored course later.
_Avoid_: level, stage, map

**Rung**:
A stratum of the field hung perpendicular to intended travel, marking one unit of
altitude. Rungs bow toward mass and part around the craft, so the field states gravity
and speed without an instrument.
_Avoid_: grid, grid line, carpet, mesh, floor (a rung is never a floor; **Floor** is the
orbit's, below)

**Body**:
Anything in the field with mass that the craft can be caught by. A planet is the common
kind; black holes, pulsars and binaries are others.
_Avoid_: object, entity, obstacle

**Tide**:
The bright limb segment of a body that always faces the craft — gravity drawn at
close range.

**Anomaly**:
A stretch of field where the sky itself changes: purple aurora, cloud, different rules.
The only event permitted to repaint the sky.

**Boundary**:
The graded region at the edge of the field. A place with bands of increasing heat and
reward, not a line — intensity tracks how fast the craft is closing on it, not how near
it is.
_Avoid_: wall, edge, barrier

**Fire band**:
The hottest, best-paid, most dangerous band of the boundary.

**Carpet**:
The sanctuary at the top of the field. Crossing into it ends the run as a win: gravity
lets go and the craft is thrown past the top of the screen. The boundary's mirror,
in green.
_Avoid_: goal, finish zone

## The swing

**Swing**:
One grab, one orbit, one release. The unit of play and therefore the unit of scoring.

**Grab**:
Being caught by a body. Begins when the player presses; the swing is not paid for
until it is released.
_Avoid_: capture, catch, hook

**Release**:
Letting go, along the exit tangent. Payday: the moment a swing is graded and priced.
_Avoid_: launch, slingshot, fling

**Dive**:
The part of a swing between the grab and the craft's closest approach. Real gravity and
nothing else: the dive is simulated, and no part of it is authored.
_Avoid_: approach (that is the whole run-up, before the grab), capture arc

**Floor**:
The closest a craft may orbit — a fixed clearance above a body's surface. A hard limit
that is never crossed, and the one guarantee a grab makes. The word belongs to the orbit
alone: the line that trails the climb and ends a run is the **fell-behind line**.
_Avoid_: minimum radius, surface, collision radius

**Clearance**:
The turn a grab applies to a path that would otherwise strike the body, lifting it to the
floor without adding energy. What makes the grab a rescue as well as a hook.

**Freeze**:
The moment at the end of the dive when the orbit is fixed and the craft passes from
simulated gravity onto a fixed orbit. Every clock the swing is graded by starts here.
_Avoid_: capture, insertion, lock

**Settle**:
The stretch after the freeze in which the orbit rounds toward a circle and the speed the
dive earned is spent. It ends at a fixed time, which is what gives a good dive a shelf life.
_Avoid_: circularisation, decay

**Depth**:
How far a dive committed, as a fraction of the distance from the grab to the floor. What
the boost is paid on. Depth is not aim: it says how hard you dived, never where you pointed.
_Avoid_: tightness, closeness, commitment

**Punch**:
The kick a release lands, scaled by the quality of the swing and gone within a second or so.
Bought with speed rather than with stopped time (ADR-0012), and carried entirely by the
transient, so it never changes what a run is worth.
_Avoid_: kick, impulse, boost (the boost is the lasting part, and they are different things)

**Compass**:
The signature instrument — the coloured windows drawn on the orbit path around a body,
which say where the craft will go if it lets go now, and grade the aim before it does.
Diegetic, drawn on the thing it describes.
_Avoid_: arc gauge, release gauge, release marker, aim indicator

**Window**:
One arc of the compass. Its hue is a body's identity and never changes; it heats in
place as aim closes.

**Dot**:
The single point on the compass marking a perfect release.

**Hand**:
The moving indicator on the compass showing where a release would land right now.

**Farewell ring**:
The orbit detaching from the body and expanding away at release, in AURORA.

**Hitstop**:
**Refused** (ADR-0012). It named a brief world freeze at grab and release — *"the pause is the
punch"* — and flown, even 30ms read as the game buffering. The punch is bought with speed
instead: see **Punch**. The word is kept here so that a reader who meets it in an older
document knows it was decided against rather than forgotten.

**Coasting**:
Flying without being engaged with a body. Earns nothing and costs nothing.
_Avoid_: drifting, idling

## The economy

**Carry**:
Points accrued during a swing and still at stake. Visible as the brightness of the trail.
_Avoid_: pending score, temporary points

**Cash**:
The conversion of carry into bank at release, priced by the grade of the swing.

**Bank**:
Points that are safe. What death takes from the bank is a property of the mode, not of
the economy.
_Avoid_: total, saved score

**Make**:
A release that lands inside the window but earns no word. The baseline grade: it pays
points and spends no vocabulary, because a word for "merely made it" devalues every word
above it.

**Tier**:
The grade of a single release. Four zones, three words: a make, then TRUE, SHARP and
PERFECT. Identical in every mode — modes may change what the currency is and what death
takes, never how a swing is graded.
_Avoid_: DEADEYE, CLEAN, SHAVED, rank, rating

**Band**:
The boundary heat a swing was flown in, as a multiplier on the cash.

**Streak**:
Consecutive releases at the same tier. Accuracy. Escalates by counting, never by
inventing new words.

**Chain**:
Consecutive engaged swings, broken by coasting past one rung. Engagement, not accuracy.
Gates the craft's bloom.

**Recipe**:
The complete description of a run — its seed and its input log — from which the run can
be replayed and its score independently recomputed. What makes a claimed score a fact.
_Avoid_: replay file, demo, ghost data

**Ghost**:
A recipe played back alongside a live run.

**Carpet dot**:
Loose points scattered across the carpet, swept up by whatever line the finish happens to
take. Flat, untiered and unmultiplied — the one thing in the game paid without being
earned, and marked as such.

## Risk

**Fuel**:
What a save costs. It limits how much of the deadline window the craft can afford, and
is returned by flying well rather than by collecting anything.

**Deadline**:
The ION window drawn on the craft's own projected line when it is leaving the field. Its
dot is the last press that can still save the run — the compass inverted, saying *press
here* rather than *release here*.
_Avoid_: point of no return, warning, last chance

**Save**:
A press inside the deadline window.

**Burn**:
The flaming carve back into the field that a save buys. The only time the craft's own
light wears ION.

**Powerup**:
Something the field gives the craft, paying fuel or time. Never points and never
multipliers — the economy pays for skill, and a powerup is not skill.

## The run and its modes

**Day**:
One seeded field, shared by every player on a given date, with a name and a fixed number
of bodies.

**Address**:
A body's altitude number, assigned bottom-to-top within a day, so every player's "23" is
the same body. Identity in the run is hue; the address belongs to the retelling.
_Avoid_: P11-style labels, planet ID

**Daily**:
The mode that flies today's field. One run, no retry, and death takes both carry and
bank — the run is the wager.

**Drift**:
The mode that flies a random field, unlimited, with no standings and no submission. Where
the appetite to keep playing goes, so that Daily can stay scarce.
_Avoid_: free flight (Direction 03 uses it for the coasting HUD state), practice, endless

**Zen**:
The mode with the ledger deleted. No points, no death, and the tiers still speak.

**Debrief**:
The card parked over the place the craft died, while the field behind it stays alive.

**Results sheet**:
The card that ends a run that reached the top, built to be screenshotted, carrying the
run's route and its recipe.

## Light

**Energy**:
How committed or imminent something is, expressed as bloom radius in four steps, E0 to
E3. Brightness is the game's only ordinal channel: nothing ever changes hue to mean
"better".
_Avoid_: glow level, intensity

**Identity**:
What something is, expressed as hue. A body keeps its hue forever.

**Palette**:
Eight names, each with one meaning: VOID (the sky), DUSK (structure, unlit), AURORA
(strange), ION (risk), CORE (the player), LUMEN (mid quality, and sanctuary), SOLAR
(top quality), INK (utility text).
