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

**Craft**:
The ship the player flies. It has timing and shape and never a throttle: no acceleration
input exists, and the nose points along the exit tangent for the whole of an orbit. One
craft, one field, one run.
_Avoid_: ship, player, ship object

**Tick**:
The game's unit of time, and the only clock in it (ADR-0006). Sixty to the simulated second,
fixed. Nothing in the game measures itself in seconds, because the simulation may scale time
and wall-clock time may then diverge from it permanently.
_Avoid_: frame (a frame is the renderer's and there may be more or fewer of them), step, update

**Substep**:
One of the equal slices a tick is integrated in. An implementation detail with a number
attached, named here because the number is load-bearing and has to be argued for rather than
chosen.

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

**Mass**:
How strongly a body pulls. It **is** size — a body's radius is the only thing that sets it,
and nothing else about a body changes with it. The player reads mass off the disc and off
the tide, never off a gauge.
_Avoid_: gravity strength, GM, weight

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

**Corridor**:
The field's sides and its foot — the region a run is flown inside. Today it is a constant
half-width about a centreline; spec 17 narrows it with altitude. It has no top, because
leaving through the top is the win rather than the loss.
_Avoid_: playfield, bounds, walls

**Line**:
The edge of the corridor itself, and the only absolute in it. The **boundary** is the graded
region inside the line; the line is where it stops being negotiable and the run is over.
_Avoid_: wall, barrier, edge

**Fell-behind line**:
The line that trails the climb, a fixed distance below the highest the craft has been. Falling
through it ends the run. It **does not follow a craft that is holding a body**: an orbit is a
round trip and the height gained going round its near side is not ground kept. Never called a
floor — the **floor** is the orbit's, and the two are a whole run apart.
_Avoid_: backtrack floor, trailing floor, death floor

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
until it is released. Between the grab and the release the body is **held**, and that is the
only condition under which gravity acts at all — a coasting craft feels nothing, from
anything, at any distance.
_Avoid_: capture, catch, hook

**Press**:
The one input the game has. Touch, mouse and keyboard all mean it and there is nothing
else to mean: it says *be caught by that body* on the way in and *let go* on the way out.
Held while any device is holding it, so a second finger is not a second press and lifting
one does not let go.
_Avoid_: tap (a press has a length and that length is the swing), button, hold, input

**Release**:
Letting go, along the exit tangent. Payday: the moment a swing is graded and priced.
_Avoid_: launch, slingshot, fling

**Lead**:
Where the grab looks instead of where the craft is — the craft's position displaced by two
tenths of a second of its own velocity. The body taken is the one nearest to it, so the
question a press asks is *which body am I arriving at* rather than *which body am I beside*.
Not a cone and not a threshold.
_Avoid_: aim cone, capture cone, lookahead

**Dive**:
The part of a swing between the grab and the craft's closest approach. Real gravity and
nothing else: the dive is simulated, and no part of it is authored.
_Avoid_: approach (that is the whole run-up, before the grab), capture arc

**Orbit**:
The path the craft rides between the freeze and the release. Authored rather than
simulated — a shape and a phase clock, not an integration — which is what lets a swing be
held indefinitely without drifting. One per swing, around one body.
_Avoid_: trajectory (that is any path, including a coast), path, ellipse

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

**Boost**:
The lasting speed a release is paid, on top of the orbit it left. Paid on **depth**, and
only for a stretch that begins a fixed time after the freeze and runs out again — the
**envelope** is the shape of what it pays across that stretch, and it is a shape in time,
not one of the compass's **windows**. The boost is what a swing is worth; the **punch** is
how it feels.
_Avoid_: bonus, reward, punch (the punch is the transient, and they are different things)

**Punch**:
The kick a release lands, scaled by the quality of the swing and gone within a second or so.
Bought with speed rather than with stopped time (ADR-0012), and carried entirely by the
transient, so it never changes what a run is worth.
_Avoid_: kick, impulse, boost (the boost is the lasting part, and they are different things)

**Quality**:
How good a release is, as one number. **There is deliberately only one definition of it**
(ADR-0012): a swing that froze an orbit is graded on where on the envelope it let go, and
one that never froze is graded on how hard the body is bending its heading at the instant
the button comes up. The same skill wearing different clothes, and a second definition is a
pair that agrees until it quietly does not.
_Avoid_: grade (that is the **tier**, which prices a release rather than describing it),
accuracy, rating

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

**Contact**:
The craft meeting a body. One event with two outcomes, and which one it is depends on nothing
about the geometry: while a body is held the craft bounces off whatever it meets and lives,
and while coasting the same meeting ends the run unless it is a near-parallel graze. A grab is
a promise that you will not be killed by the thing you grabbed.
_Avoid_: collision, crash (a crash is the **impact** ending, which is one outcome of a contact)

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

**Run**:
One craft, one field, one climb, from the spawn to whatever ends it. The unit a recipe
describes and a score belongs to.
_Avoid_: game, session (a session is a sitting and may hold many runs), life, attempt

**Ending**:
How a run stopped, and there are four. Three are deaths — **impact** (a contact while
coasting), **out of bounds** (leaving the corridor sideways, or falling out of its foot) and
**fell behind** (through the fell-behind line) — and the fourth, **cleared**, is the win: above
the point where the last body has gone out of grab range. A run is over exactly when it has an
ending, and the ending says which.
_Avoid_: game over, death (death is the three; the win is an ending too), reason, cause

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

**Design space**:
The rectangle the game is composed in — a phone held in portrait — and the coordinates
everything the player reads is drawn in, so that the composition is identical on every
device and nothing lands on a bar. It is fitted whole and centred, with **letterbox** bars
filling whatever is left; DOM is developer chrome only.
_Avoid_: viewport, screen, canvas size, resolution

**Camera**:
Where the world is being watched from — a position, and never anything else. It is never
rotated, never shaken and never randomised, and it is part of what a tick presents rather
than something the renderer decides, so a frame can be asserted without a canvas.
_Avoid_: view, viewport, scroll position
