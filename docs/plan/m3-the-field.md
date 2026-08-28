# M3 · The field

`VISION.md`'s honest assessment: the game already knows what it wants to look like and looks
like it about a quarter of the time. The anomaly is finished-product quality and sustains for
roughly 25 seconds of an 85-second run. The other 60 seconds are this milestone — not by
extending the anomaly, whose rarity is what makes it land, but by holding the rest of the
field to the same standard.

---

## M3.1 · Camera and design space

Everything the player reads is drawn in world space in the 1170×2532 design space, so the
composition is identical on every device, and nothing the player reads is drawn outside it. What
is outside it is **bleed** — world rather than black, bounded by the corridor's line, built in
[M1.4](./m1-the-swing.md). DOM is developer chrome only. A desktop window bleeds wider than a
phone, and that is accepted rather than hidden (ADR-0010).

**And this step owes the camera a sideways axis.** M1.4 gave the field a corridor 1.9× the design
width, which retired `camera.ts`'s *"it does not pan sideways"* — measured, the craft can be
**538 design units outside the picture and still alive**, and 359 of those survive the bleed. The
numbers and what they were measured over are under
[M1.4 · The camera decision has expired](./m1-the-swing.md#m14--death-and-the-shape-of-a-run);
they are not restated here, because two copies of a measurement are two copies that drift.

**Acceptance**: identical composition across aspect ratios; nothing readable in the bottom
third, ever. **Verify**: `pnpm test` on the projection, plus screenshots at three aspects.

---

## M3.2 · Rungs

Spec `05-field`. The Geometry Wars tribute, earned: the loved quality is a continuous medium
that bends around mass and reacts to the player, and the shape — a floor plane — cannot come
with us. So: horizontal strata every 25m, perpendicular to travel, a ladder rather than a
floor. They bow toward every mass with radius scaled by its pull, part around the craft and
relax behind it in ~400ms, and every fifth carries its address.

Rungs are **level sets of progress**, perpendicular to intended travel. Written that way, a
ring course inherits the whole grammar unchanged later.

**Acceptance**: bow ≤ 30px, wake relaxes in ~400ms, addresses on every fifth rung, and the
frame budget still holds with rungs on. **Verify**: `pnpm test` plus the M3.6 harness.

---

## M3.3 · Sky, dust, anomaly

VOID that warms almost imperceptibly toward AURORA as an anomaly approaches — weather on the
horizon, never spent early, tint ≤6% outside the anomaly. Sparse dust motes falling in strict
parallel at world speed, brightness varied α .1–.3, density rising gently with chain. **No
parallax layers** — layers at different speeds are implied depth, and this world has none.

The anomaly is the only event permitted to repaint the sky: purple curtains over true black
cloud gaps, planets reading through the tint. The baseline's restraint is what keeps it rare.

**Acceptance**: the anomaly reads as the reference standard; nothing outside it repaints the
sky; dust velocity is uniform. **Verify**: eyes, plus a test that no layer has its own speed.

---

## M3.4 · The boundary

Spec `07-boundary`. Three laws: **intensity is closing speed, not proximity** — coast along
the outer band and the edge glows softly, dive at it and it flares; **reward is shown, never
spoken** — scoring motes are the only signage, sparse in the outer band, dense in the fire
band, absent past the line; **the line is the only absolute.**

Bands are drawn in world space, never on screen edges, so the edge reads as geography rather
than as a vignette. Outer band ×2 from edge−220m, fire band ×3 from edge−90m.

The deadline track is the compass inverted: green windows on orbits say *release here*; the
ION window on the craft's own projected line says *a press here still saves you*, its dot the
last possible moment, the line dashed past it. Fuel couples to it **by luminance, never
geometry** — the window is drawn at its true physical size and only the portion the tank can
afford stays lit. A moment exists, and you cannot buy it.

Death: 70ms hitstop at the line, then the craft unravels along its velocity over ~900ms —
stretch, core thinning, embers streaming strictly parallel. No explosion, no slow-mo, no
shake. The release condenses the player's light into a word; the loss disperses it into the
field.

**Acceptance**: skimming parallel keeps the edge calm; a dive flares it; the deadline dot is
the last tick a save is possible. **Verify**: `pnpm test` plus eyes.

---

## M3.5 · The retro grade

Spec `14-retro-grade`. Weighted to post-processing — scanlines, grain, bloom, slight chromatic
aberration — over the pass the energy channel already needs. Plus the authoring rules the other
specs inherit: a minimum stroke weight, dither in preference to smooth gradients, display type
only from the arcade face.

Build it as a **knob**, not a look. The author tunes it on a phone; "a touch more retro" is a
judgement made against the running game, not decided in advance.

**Acceptance**: the grade can be dialled from off to heavy at runtime, and the game is legible
at both ends. **Verify**: fly it with the knob.

---

## M3.6 · The frame-budget harness

`VISION.md` names this as a standing gap: the correctness gate says nothing about time, and a
rendering-induced slowdown reached a phone with nothing in the repo able to catch it. **The
units that matter are p99 and max, not mean** — that class of bug hides behind an average of
calls that mostly return early.

**Acceptance**: a command that reports p99 and max frame time for a replayed recipe, and a
recorded baseline on the author's phone. **Verify**: run it on the phone.

---

## Exit

The field looks like Aphelion for the whole run rather than a quarter of it. Next:
[M4](./m4-the-economy.md).
