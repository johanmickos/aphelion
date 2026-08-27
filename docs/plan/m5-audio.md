# M5 · Audio

No design board covers sound, and `VISION.md` is blunt about why that matters: spectral analysis
of full recorded sessions found **no game audio at all**. A warp, a finish line and a slot-machine
roll-up all currently happen in silence. It calls this the largest single gap in the game and the
highest gameplay return per hour available.

The design made it worse in one specific way: a 70ms world freeze sits at the centre of the
release. Hitstop with no sound is a stutter. Hitstop with a cut in the audio is a punch. The
boards' entire "the pause is the punch" thesis is half-built until this milestone runs.

Audio here is a **mechanic, not a coat of paint**. Spec `15-audio`, written in M0.1.

---

## M5.1 · The audio engine

Tick-driven scheduling, so sound is derived from the same clock as everything else and a recipe
produces the same score in both senses of the word. Web Audio, no library unless the spike in M0
already settled a dependency policy that covers it.

The layer boundary matters: audio is **driven by presentation state**, never by the renderer, and
never by wall-clock time. Hitstop is a time-scale the simulation applies (ADR-0006), so the audio
clock has to respect it or the cut will drift.

**Acceptance**: audio events derive from ticks; a replayed recipe schedules an identical event
list; muting is total and instant. **Verify**: `pnpm test` on the event list, no ears required.

---

## M5.2 · The swing's voice

The load-bearing idea, from `VISION.md`: **a pitch ramp through the boost arc, peaking at the
release window.** If it works it teaches the core timing better than the compass does — and the
compass is the best thing in the game. Build this first and alone, before any other sound exists,
because everything else is decoration if this fails and unnecessary if it succeeds.

Then: the cut at hitstop, the impulse at release, the tier landing with the word, and death.

**Acceptance**: a player who cannot see the compass can still hit the window by ear.
**Verify**: the author flies it with the instrument hidden.

---

## M5.3 · The field's voice, and the chain

A clean release lands on the beat, and a chain that is going well **layers an instrument in** —
the relationship *Tetris Effect* and *Sayonara Wild Hearts* have with their players. The anomaly
gets its own register, since it is already the one event allowed to repaint the sky.

**Acceptance**: chain level is audible without being read; the anomaly is audibly a different
place. **Verify**: the author flies it.

---

## M5.4 · Mix and mobile

Master mix, per-bus levels, a mute that survives reload, and the mobile autoplay unlock on first
touch. Nothing may block the first frame waiting for audio to initialise.

**Acceptance**: sound starts on the first press, on a phone, cold.
**Verify**: on the phone.

---

## Gate

**The author flies it.** The question is the one `VISION.md` poses: does the ramp teach the timing
better than the gauge does. Next: [M6](./m6-the-run.md).
