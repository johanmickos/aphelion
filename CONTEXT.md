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
and speed without an instrument. Every fifth is **addressed** — drawn brighter and
carrying a number.
_Avoid_: grid, grid line, carpet, mesh, floor (a rung is never a floor; **Floor** is the
orbit's, below)

**Bow**:
How a rung bends toward a body. The field's statement of gravity at a distance, made
before the player presses — the **tide** is the same statement at the rim. It is a
property of mass, so it is there whatever the craft is doing. **Switched off in the
build** (author, 2026-08-30) with the mechanism kept whole; the word stays because it is
what is being turned back on.
_Avoid_: sag, warp, dent, gravity well (the bow is what is drawn, not what it means)

**Wake**:
How a rung parts around the craft, and relaxes behind it. A displacement of a structure
that is already there, never something emitted — nothing in this game radiates from a
point. It has a **place** rather than a centre: what relaxes is the rung's memory of
where the craft pressed. **Switched off in the build** alongside the **bow**, and still
derived every tick so that turning it back on needs no warm-up.
_Avoid_: ripple, wave, shockwave, trail (the **trail** is the craft's own line through
the field)

**Metre**:
The field's unit of altitude, and the unit every spec states the world's geometry in —
rung spacing, the boundary's bands, the corridor's width, the points a climb pays. One
metre is one of the prototype's units, so it converts into design units by the same
factor everything else does.
_Avoid_: unit (unqualified), design unit (that is what a metre converts *to*), pixel

**Body**:
Anything in the field with mass that the craft can be caught by. A planet is the common
kind; black holes, pulsars and binaries are others. A body is always in one of four states —
**ahead**, **in reach**, **held** and **spent** — and it says which by how it is lit, never
by changing hue.
_Avoid_: object, entity, obstacle

**Strata**:
The concentric rings inside a body, in its own hue. Structure without texture: they say the
body has an inside without implying a surface, a light source or a depth the world does not
have. One of them drags behind the **tide**.
_Avoid_: bands (a band is the boundary's), layers, rings (a ring is the compass's)

**Spent**:
A body that has been held and let go. Its lamp goes out at the **release** and not at the
grab, and it stays out for the rest of the run unless the craft grabs it again — so the field
of them behind the craft is the run's scoreboard, drawn in the world rather than in a corner
of it.
_Avoid_: used, dead, exhausted

**Mass**:
How strongly a body pulls. It **is** size — a body's radius is the only thing that sets it,
and nothing else about a body changes with it. The player reads mass off the disc and off
the tide, never off a gauge.
_Avoid_: gravity strength, GM, weight

**Grip**:
How hard a body has hold of the craft **right now**, from nothing to all of it — the live pull,
against the hardest that body could ever pull, which is the pull at its own **floor**. A ratio,
so it means the same thing on every body whatever its **mass**. It is what decides whether a
body lights up at all: the field ahead is a constellation of rims, and a body glows when it is
gripping rather than when it is merely reachable.
_Avoid_: gravity, force, attraction, proximity (grip is what proximity buys, not the distance)

**Closing**:
How far the craft has come into a body's **reach** — nothing at the edge of what that body can
hold, all of it against the surface, and linear in between. It is the *distance*, where **grip**
is what the distance buys, and the two are kept apart because they are wanted for different jobs:
grip is the physical truth and decides whether a body lights up at all, and closing is what an
approach is *drawn* with. Grip falls as 1/r², so at the edge of a hold it is 0.009 — anything
painted with it is invisible across most of the span it is meant to describe. Measured on a real
approach, closing runs 0.31 → 0.88 where the tide's own strength runs 0.42 → 0.63.
_Avoid_: proximity (see **grip**), nearness, distance (unqualified — closing is the *ratio*)

**Tide**:
The bright limb segment of a body that always faces the craft — gravity drawn at
close range. It **lags**, and the lag is the point: a heavier body reaches with a longer,
brighter, tighter-tracking tide, so how hard something pulls is read off the picture rather
than off a gauge. It **grows out of the body's own edge** rather than arriving with a width:
far off it is the rim, lit; as the craft closes it swells to twice its stated width and
tapers back into the rim at both ends of its arc, so it reads as reaching rather than as a
band laid on top. The lag stays visible — p50 2.1° — and small enough that the bright core
sits under the craft (2026-08-29).

**Sky**:
The layer behind everything, and the only thing in the game whose colour is not fixed. It is VOID,
and it warms almost imperceptibly toward AURORA as an **anomaly** approaches — at most a few per
cent, and never for any other reason. It is repainted outright only by a **charge**, which is
earned rather than arrived at. The **starfield** and the **dust** are drawn in front of it and are
not it.
_Avoid_: background, backdrop (spec 05 §1: the player climbs *through* a medium, not past one),
space, void (VOID is the colour token, not the layer)

**Dust**:
Sparse motes hanging in the field. They vary in brightness and never in velocity, and because they
are fixed in the world what they show is **world speed** itself: a long exposure, streaking as the
world passes and stippling when it stands still. Density rises with the **chain** and nothing else
about them changes.
_Avoid_: particles, snow, debris, stars (a star is the **starfield**'s, and it is the one thing in
the field that does *not* move at world speed)

**World speed**:
How fast the world passes the picture — one number, and the rate every layer of the field except
the **starfield** moves at. It is not the **craft**'s speed and the two must not be confused:
through an orbit the craft is at its fastest while the picture is nearly still. What the **rungs**
cross at, what the **dust** streaks by, and what the complaint *"the rungs travel by too quickly"*
is about.
_Avoid_: scroll speed, climb rate (the climb is where it goes; this is how fast), camera speed
(that names the mechanism), velocity (that is the **craft**'s)

**Anomaly**:
A **body** outside the **corridor**, and the stretch of field above it that its **charge** repaints.
One a day. It is the only thing in the game that is optional: it is reached by leaving the corridor
through its **shelter**, it must be captured or the craft is carried out the far side and dies, and
a run that never looks for it is a complete run. It carries no **address** — there is one, so the
definite article names it.
_Avoid_: storm, event, zone, region (a region is a whole field's worth of rules; an anomaly is one
body and one stretch inside one), anomaly planet (it is a body, and no other body is called a planet
in this glossary)

**Shelter**:
The region a body projects inside which the **line** is suspended — and only the line. The
**fell-behind line** and the top of the field are untouched, because a craft exempt from every bound
would drift forever in a straight line with nothing to catch it. Only the **anomaly** projects one.
It is what lets a craft cross the line to reach it, and it is what makes missing it fatal: leaving
the far side of a shelter puts the craft outside the line on the next tick, and that is the miss.
_Avoid_: bubble, safe zone, sanctuary (the **carpet** is the only sanctuary), field

**Charge**:
What a craft carries after taking the **anomaly** and leaving it. While it lasts, every **grab**
**reels** the craft onto an identical orbit, nothing about a **capture** or a **release** is graded,
and the **sky** is repainted. It runs while the craft is inside the anomaly's own stretch and ends
by being climbed out of — a place, not a clock. Nothing in this game expires on one.
_Avoid_: window (a **window** is the compass's), buff, charged window, powerup (a **powerup** is
something the field gives you; a charge is something you went and got), boost (the **boost** is the
release envelope's)

**Reel**:
How a **grab** takes a body while the craft is **charged**: the craft is drawn straight onto a
settled orbit instead of **diving** to one. The same orbit on every body, at the same radius and the
same pace, because a rhythm needs every beat to be the same — measured in the prototype, letting aim
decide the orbit made it a lottery rather than a gradient.
_Avoid_: zip (the prototype's word for it), snap, pull, hook (a body is **grabbed**, never hooked)

**Boundary**:
The graded region at the edge of the field. A place with bands of increasing heat and
reward, not a line — intensity tracks how fast the craft is closing on it, not how near
it is.
_Avoid_: wall, edge, barrier

**Heat**:
How hard the **boundary** is answering, in one number. A function of **closing speed**
first and of distance only as a sharpener, which is the whole of the boundary's first law —
*a barrier reacts to where you are; a risk reacts to what you are doing*. Everything the
edge draws is drawn at it: the gradient, the **boundary motes**, the label and the
**line**'s own stroke. There is one per side, so diving at one **line** flares it and calms
the other in the same frame.
_Avoid_: intensity, alarm, danger, proximity (that is the thing it is deliberately not),
threat level

**Presence**:
Whether the **boundary** is part of the conversation at all, and a channel of its own beside
**heat**: heat says how hard the craft is diving at a **line**, this says whether that line is
drawn. Absent while the craft flies the field — *"the boundary SHOULD be off screen for
majority of play"* — and arriving as the craft goes out past the picture's own edge, per
side. Absent means nothing is drawn, not a dimmed layer: what is over is absent.
_Avoid_: visibility (that is the camera's question), opacity, fade-in

**Closing speed**:
How fast the craft is closing on one **line**, and zero when it is receding. Not the
**craft**'s speed and not **world speed** — a third quantity, and the three are nowhere near
each other: a craft skimming a **line** flat out is closing on it at nothing.
_Avoid_: approach rate, wall speed, closure

**Boundary mote**:
The drifting specks that say what a band pays. Denser and brighter deeper in, and absent
past the **line**. They are **dust** at a different density and alpha, and they drift at
**world speed** like it. **The glimmer is the whole signpost** — the `×2` / `×3` caption was
built and refused (2026-09-01, *"let the user discover that themselves"*), so what a band
pays is something the player learns by going there.
_Avoid_: particle, spark, pickup (nothing is collected — a mote is a sign, not a thing),
band label (built and refused)

**Fire band**:
The hottest, best-paid, most dangerous band of the boundary.

**Corridor**:
The field's sides and its foot — the region a run is flown inside. Today it is a constant
half-width about a centreline; spec 17 narrows it with altitude. It has no top, because
leaving through the top is the win rather than the loss. It is **wider than the picture**,
and deliberately: what a player gives up by racing one side is sight of the other, which is
where a **powerup** or the **anomaly** may be.
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
The kick a release lands, scaled by the **quality** of the swing and gone within a second or so.
Bought with speed rather than with stopped time (ADR-0012), and carried entirely by the
transient, so it never changes what a run is worth. **Quality enters twice** — as how far it
displaces the view and as how long it takes coming home — and the second is the gentler channel,
so a mistimed release still gets a punch and what it loses is how far the punch carries. **It is felt in two places and neither of them is the camera.** The craft's own **deformation**
carries how it looks, and a decaying burst of **speed** along the exit tangent carries how it
flies — spec 01 §8's transient, which is the 78% of the **boost** a release does not keep. The
camera was tried and refused: *"we don't really want shake effects or pauses like that, it turns
out that really disrupts the flow"* (author, 2026-08-29). Spec 00 §5's motion table calls the
camera's share of it KICK, and that row is void; **the word is punch**.

**The burst never bends the ray**, only how fast the craft covers it, which is what lets it exist
at all: **coasting**'s straight line is what makes the **compass** a solved reading rather than a
simulation, and a burst along the tangent leaves that geometry untouched.
_Avoid_: kick, impulse, boost (the boost is the lasting part, and they are different things),
shake (a shake says damage, and this game has none)

**Quality**:
How good a release is, as one number. **There is deliberately only one definition of it**
(ADR-0012): a swing that froze an orbit is graded on where on the envelope it let go, and
one that never froze is graded on how hard the body is bending its heading at the instant
the button comes up. The same skill wearing different clothes, and a second definition is a
pair that agrees until it quietly does not.
_Avoid_: grade (that is the **tier**, which prices a release rather than describing it —
and, in *Light*, the **grade** that paints the frame, which is a third thing again and
never this one), accuracy, rating

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
The moving indicator on the compass showing where a release would land right now. It is the
radius through the craft, drawn out past the outermost ring, so the thing that says *when* is
the same line the craft is standing on.

**Crossing**:
Where the **hand** cuts one of the compass's rings — one mark per ring, and the gap between it
and that ring's **dot** is the grade, drawn on the geometry rather than said. Spec 00 §6 calls
it a *ghost*; that word is spent on a **recipe** played back beside a live run, and one word
for two things is a fork, so this is the word.
_Avoid_: ghost (a ghost is a replay), ghost dot, marker

**Sighting**:
A body the picture cannot show, marked at the edge of it in that body's own hue. Where
the **compass** is drawn on the thing it describes and needs a **grab** to exist at all, a
sighting is about something out of sight and is always there — which is the whole of what a
craft has to go on while **coasting**. It says three facts and gives no instruction: which
body, which way, and how far. Never drawn for a body already on screen, never for one
behind the climb, and never for one past reach.
**It points, and it says how far.** That reverses the ruling of 2026-08-28 that it must not,
flown (author, 2026-08-29): *"this is another instance of an original rule being too strict."*
Its **position** on the edge still carries the direction and the arrow agrees with it rather
than replacing it, so the two can never disagree. The number is a **distance and not a name** —
a body is still named by hue in the run, and the `P11` chips stay retired.
_Avoid_: waypoint, blip, radar, edge dot (**dot** is the compass's, and **carpet dot** is the
carpet's)

**Flown arc**:
The stretch of orbit the craft has already ridden since the **freeze**, drawn on the orbit path
and lit by what the **boost** was worth along it. Time runs along it, so it is the **envelope**
seen as a shape in space rather than one in time — dim while the boost was arming, brightest
across the plateau, dying behind the craft as it expires. It is the only thing in the game that
draws the timing half of the tension, and it exists because nothing did: flown, 34% of releases
landed before the boost had armed (author, 2026-08-29).
_Avoid_: trail (the **trail** is the craft's own line through the field and its brightness is the
**carry**), history, tail, swept arc

**Trail**:
The craft's own line through the field: one solid luminous line in CORE, and the **carry**'s only
pixel — its brightness is what the run has at stake, so the player can see what death would cost
without reading a number. A wake and not a route: it is a bounded number of samples taken on the
**tick**, so the world is still where motion is read from. It survives with the **ledger** deleted,
at a floor, because the line is the craft's and only the brightness is the economy's.
_Avoid_: breadcrumbs, path, wake (a **wake** is what the craft does to the rungs), route, history

**Callout**:
The word an event earned, arriving at the place that earned it — for a **release** at the **dot**,
for an **arrival** at the closest approach. There is **one of each alive at a time** and never a
queue, so two words of the same kind can never fight over an instant.

The release's: the word, its points and its colour, arriving as one unit at the **dot** that
earned it — with the **window** it was taken on still lit behind it. It pops, lingers and decays
where it was born, world-anchored, so the craft leaves it behind rather than carrying it. A
**make** earns points and no word.
_Avoid_: award (that is the grading, and a callout is how it is said), banner, toast, popup,
score text

**Aim**:
Where a **press** was pointed: the sine of the angle between the craft's velocity and the line to
the body, 0 straight at it and 1 exactly past it. Because a coasting craft feels no gravity the
path a press interrupts is a straight line, so this is that line's true angle and not an estimate
of one. An **angle** and never the distance it subtends — the distance cannot exceed the radius it
was measured at, so it is unreachable for the closest presses, which is the bug the author flew on
2026-08-30. Half of what an **arrival** is graded on; **depth** is not aim, and neither is
**alignment**, which is a release's reading of the same word.
_Avoid_: impact parameter (the undivided distance, and the thing that broke), approach angle,
attack angle, sidewaysness

**Arrival**:
The word a **dive** earns for being hard, and the two readings that decide it: how close its
closest approach came to the body's **floor**, and how sideways its **aim** was. Both are needed
and neither works alone — the floor is a guarantee, so a dive pointed at a body reaches it for
free, and a dive aimed perfectly may never come down. Graded on one rung rather than a ladder, so
a **capture** either says something or says nothing. There is no instrument for it and that is deliberate: the cue is the body's own light,
which already grows with **grip** and swells with **closing** as the craft comes in.
_Avoid_: capture quality (a **capture** is the event and this is the reading of it), tightness
(that is on **depth**'s avoid line), approach, capture grade **What counts as tight now reads the speed it
arrived at** (author, 2026-08-31): a capture coming in faster than real play's median is forgiven
some of how sideways it had to be, because *"coming in fast makes it harder to capture the lowest
approach"* — measured, the faster half of the author's captures land twenty times further from the
floor than the slower half.

**Knock**:
A hard landing on the **floor** by a craft that was pointed at the body, and the word it earns. Two
readings have to hold at once: the floor took a real share of the craft's speed in one tick, **and**
the **aim** was head-on. The **arrival**'s opposite, and the two can never be said of the same
**capture** — since 2026-09-01 that is a property of the test rather than of a threshold, because the
aim a knock requires is the aim an arrival forbids. The share alone used to stand in for aim and does
not: it saturates at low speed, so the hardest landing in the author's corpus belongs to a capture
that came in almost perfectly sideways. Spoken in ION, the world's reserved pink,
because it is about what the floor had to do and not about the body.
_Avoid_: bounce (the **floor** does that on every dive and mostly for free), crash (a run ends on
one; this does not), impact (that is an **ending**), collision

**Starfield**:
The stars in the **sky**: three tiers sliding against the camera at a twentieth, an eighth and a
fifth of its motion, so the world reads as having distance behind it. **The one thing in the game
that does not move at world speed**, and the one depth cue — spec 05 §2 refuses all of them and was
overturned by the author on 2026-08-30, on the grounds that parallax conveys speed and nothing else
in the field does yet. One colour at three brightnesses, DUSK to INK, never **CORE**. It lives
wholly in the renderer and the simulation cannot see it. **It keeps its place beside the rungs and
comes down to meet them** (author, 2026-08-30, once they landed): *"I still want it there, but only
as background noise."*
_Avoid_: sky (the **sky** is the layer; this is what is in it), background (it is a layer of the
world, not behind it), stars (the tier, not the thing), parallax layers (that names the mechanism;
this names the thing)

**Farewell ring**:
**Refused** (author, 2026-08-29). It named the orbit detaching from the body and expanding away at
a release, in AURORA, and it was built and flown: *"when I release mid-circularisation, the oval of
the orbit I'm on turns a bit purple and expands a bit. Let's remove that functionality."* The word
is kept here so that a reader who meets it in an older document knows it was decided against rather
than forgotten. What marks a release instead is the **callout** and the craft's own **punch**.

**Hitstop**:
**Refused** (ADR-0012). It named a brief world freeze at grab and release — *"the pause is the
punch"* — and flown, even 30ms read as the game buffering. The punch is bought with speed
instead: see **Punch**. The word is kept here so that a reader who meets it in an older
document knows it was decided against rather than forgotten.
⚠ **And the refusal covers death too** (2026-09-01). Spec 07 §6 puts a 70ms hitstop at the
**line**, which this entry did not name — but the ADR's reason is not about which event the
freeze follows: 30ms was refused at *every length tried*, 70 is longer, and stopping the step
breaks the fixed timestep either way. So the loss opens at T0 like the release does.

**Engaged**:
Holding a body — from the **grab** to the **release**, dive and orbit alike. The only condition
under which gravity acts, and the only condition under which **carry** accrues. Its opposite is
**coasting**, and there is no third state.
_Avoid_: attached, tethered, connected, active

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

**Ledger**:
The whole of what a run is worth and everything that prices it — **carry**, **cash**, **bank** and
the **fuel** tank. It is composed beside the picture rather than inside it, so a **mode** with no
currency simply does not open one: **Zen** runs with the ledger *absent* rather than stubbed, and
that absence is what proves the seam between **grading** a swing and pricing one is real. Nothing
that grades a swing may import it.
_Avoid_: score system, economy module (the economy is the rules; the ledger is what holds them),
scoring engine

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
It names the **field** it was flown in rather than carrying it, because a run flown in one
field and replayed in another is a different run and the numbers do not say so.
_Avoid_: replay file, demo, ghost data

**Dispatch**:
What a session sends back: a **recipe**, the ticks the author flagged while flying it, and
what they wrote afterwards. The evidence and the testimony in one envelope, so that *"the
grab feels late"* has the run that produced it underneath and a disagreement about the
swing becomes a disagreement about a tick number. It is **not** a second name for a
recipe — a recipe is the run, a dispatch is the run and what somebody made of it — and it
belongs to development rather than to the game: it goes from the phone to the machine that
keeps it, and nowhere else (ADR-0003).
_Avoid_: report, diagnostics, telemetry (Direction 04 retires the telemetry voice), bug
report

**Moment**:
A kind of instant in a run, named by the sentence that describes it — _a swing let go at
the very top of its boost envelope_, _a release at PERFECT aim with no boost at all_ — and
found in a **recipe** rather than pointed at by tick number. It is what a golden is a claim
_about_: the tick a moment lands on is a coordinate the physics regenerates, and the
sentence is the thing a deliberate change has to be argued against. A moment that a run
holds more than one of is asserted over every one of them, so there is no selection to go
wrong; one it holds none of fails, naming itself. Development's word, like **recipe** and
**dispatch**, and it belongs to `test/moments.ts`.
_Avoid_: golden (a golden is the assertion, a moment is what it is about), named tick,
checkpoint, marker

**Budget**:
What one frame of the game has to spend, and what the harness is about. Development's word,
like **recipe** and **dispatch**. It is always **p99 and max** and never a mean — an
intermittent hitch is the one thing an average of frames that mostly return early hides —
and it has two halves that are measured on different machines: what a **tick** costs, which
a laptop can time honestly because the simulation is pure, and what the rest of a frame
costs, which only the device can say. `pnpm budget` joins them.
_Avoid_: performance, frame time (that is one measurement; the budget is what it is spent
against), FPS

**Build**:
The state of `src/` and `app/` a run was flown under, as a short hash the dev server stamps
onto a **dispatch** when it arrives. Development's word. It is what a **recipe**'s `sim`
cannot say: `SIM_VERSION` moves only when a *tick* moves, so a change that alters what a
frame **costs** and deliberately leaves the swing alone is invisible in it — which is most
performance work. A measurement without one has no cohort.
_Avoid_: version (a recipe's `sim` and a field's version are versions and mean something
narrower), commit, revision

**Ghost**:
A recipe played back alongside a live run.
_Avoid_: using it for the compass's mark where the hand cuts a ring — that is a **crossing**

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
here* rather than *release here*. There may be **more than one window**: the stretch a
press works from has gaps in it, because what a press does depends on what is in reach.
It is a **prediction and not a fact** — it asks whether one press-and-hold turns the craft
away, and never whether releasing and grabbing something else would.
_Avoid_: point of no return, warning, last chance

**SOS**:
The strobe that says the craft is in trouble and no press is going to change it — drifting
past the **deadline**'s dot, or holding a body the press was already too late to take. The
word is chosen for what it does **not** claim: at 95% accuracy neither *doomed* nor *lost*
is entitled to a claim about the outcome, and this asserts only that the craft is in
trouble, which is what is known.
_Avoid_: doomed, lost, death mark, skull (the prototype's glyph; this game has a word)

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

**Mode**:
What a run's currency is and what death takes from it — and **nothing else**. A mode may never
change how a swing is graded: the **tier**s, the zones, the **band**s and the **streak** rules are
identical everywhere, so skill transfers and the **compass** never has to be relearned. It is a
value read by the **ledger** and by nothing that grades.
_Avoid_: game mode, difficulty, ruleset

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

**Bloom**:
The light leaving a thing, as a radius. The one measurement **energy** is expressed in, and
therefore the only thing in the game that means *more*: a step of energy is a radius and a
link of chain is a radius, and neither is ever a hue or an opacity. It is drawn outward from
the edge of whatever emits it, never as a disc over it.
_Avoid_: glow, halo, aura, emission

**Flash**:
The E3 — the brightest step, additive, and **the only one of its kind alive at any moment**. A new
one replaces the one before rather than stacking with it, so two can never fight over the same
instant. It stays where it was struck, because what it marks is the place the thing happened and
not the thing. **Nothing strikes one today**: the release, the grab and the award have each been
flown and taken off it (author, 2026-08-29) — the body already speaks for a grab, and the award's
word already blooms in its own tier colour, so the flash was a second glow arguing about one
instant. What is left for it is the checkered line at the crossing.
_Avoid_: burst, pop, blast, spark (a spark is the bank's, in the economy)

**Decay**:
A value in the picture on its way back to nothing, or back to rest. Everything the design
puts between the physics and the pixels has one — the **flash**, the **deformation**, the
camera's kick, the rungs' wake, a callout — and they are one shape with different lengths.
A decay **ends** rather than becoming very small, so a thing that is over is absent.
Never the **settle**, which is the orbit rounding toward a circle and is a whole layer down.
_Avoid_: fade, timer, animation, easing

**Deformation**:
The craft's shape under a release: drawn out along its own velocity and narrowed across it,
returning past rest once before it settles. Along the velocity vector always, never along a
screen axis and never around a centre — the game is side-on and nothing in it radiates from
a point.
_Avoid_: squash and stretch, squish, wobble, scale

**Identity**:
What something is, expressed as hue. A body keeps its hue forever.

**Palette**:
Eight names, each with one meaning: VOID (the sky), DUSK (structure, unlit), AURORA
(strange), ION (risk), CORE (the player), LUMEN (mid quality, and sanctuary), SOLAR
(top quality), INK (utility text).

**Grade**:
The full-screen coat laid over the finished frame, and the last thing drawn: a lift of the
blacks toward VOID's violet, an ordered **dither**, an animated **grain**, and a comb of
**scanlines**. It is one master knob with the stages ganged behind it, and it goes to
nothing — the game is exactly as legible with it off, because the retro register is earned
structurally and **a grade that is carrying the register means the register is not there**.
It is a coat and never a channel: nothing may become readable, rankable or true because of
it. The **bloom** shares the pass and is not part of it — bloom is **energy**, which is
meaning, and this is paint.
_Avoid_: post-processing (that is the mechanism, and this is the thing), filter, look, LUT,
CRT effect, tint. And **grade** in this sense is not the **tier** — see **quality**: one
prices a release and one paints the frame, and neither ever describes the other.

**Design space**:
The rectangle the game is composed in — a phone held in portrait — and the coordinates
everything the player reads is drawn in, so that the composition is identical on every
device. It is fitted whole and centred; nothing the player has to read lives outside it,
ever. DOM is developer chrome only.
_Avoid_: viewport, screen, canvas size, resolution

**Bleed**:
The world drawn outside the design space, filling whatever the fit left over. How much of
it a device shows depends on the device, so nothing may live there that the player has to
read — it is the world seen further, never part of the composition. Bounded by the
corridor's line, because past that there is no world to show.
_Avoid_: letterbox bar (that was what the leftover used to be), overscan, margin

**Camera**:
Where the world is being watched from — a position, and never anything else. It is never
rotated, never shaken and never randomised, and it is part of what a tick presents rather
than something the renderer decides, so a frame can be asserted without a canvas.
_Avoid_: view, viewport, scroll position
