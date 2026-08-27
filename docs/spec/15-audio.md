# 15 · Audio

**Board**: none. Authored from the direction in [M0.1](../plan/m0-foundations.md) and
`VISION.md`'s "How it should sound".

**The premise**: the game is currently silent, and spectral analysis of full prototype sessions
finds **no game audio at all** — a warp, a finish line and a slot-machine roll-up all happen in
silence. `VISION.md` calls this the largest single gap in the game and the highest gameplay return
per hour available.

**Depends on**: [02 · Release](./02-release.md) for the timings, [06 · Awards](./06-awards.md) for
the tiers, [01 · Swing](./01-swing.md) for the boost envelope this spec's headline feature reads
from.

---

## 1 · The law

**Audio is a mechanic, not a coat of paint.**

Every sound in this spec either teaches a timing, states a fact the player needs, or is the
rhythmic bed the first two land on. A sound that does none of those three is not shipped.

The target relationship between play and sound is the one *Tetris Effect* and *Sayonara Wild
Hearts* have: **a clean release lands on the beat, and a chain that is going well layers an
instrument in.**

## 2 · The load-bearing idea: the pitch ramp

> A pitch ramp through the boost arc, peaking at the release window, would teach the core timing
> better than the compass does — and the compass is the best thing in the game.

This is the reason to build audio at all, and it is built first.

| Property | Rule |
|---|---|
| Source | The **boost envelope** from spec [01](./01-swing.md) — the same curve pillar 2 says peaks a fixed interval after the orbit freezes |
| Mapping | Pitch rises monotonically with the envelope. The **peak of the pitch is the peak of the envelope** |
| Aim coupling | A second, quieter voice tracks the **hand-to-dot gap** (spec [00](./00-tokens.md) §6): as the gap closes, this voice rises toward unison with the first |
| What the player hears | The two voices converging **is** pillar 2's tension made audible: the boost peak and the release dot arrive together only when the dive was shaped so they would |
| At the dot | Unison. The player can hear a PERFECT coming with their eyes closed |
| Range | Roughly an octave over the arc. Tuned so that the difference between SHARP and PERFECT is audible, on a phone speaker, in a noisy room |

**Nothing in the audio layer may tell the player what to do.** The ramp is a dial, exactly like the
compass: it states where the envelope is, and the player draws the conclusion (pillar 4).

## 3 · Hitstop is a cut, not a fade

The 70ms world freeze at grab and at release is **a cut in the audio**, matching the cut in the
picture (spec [02](./02-release.md)).

| Element | Behaviour across hitstop |
|---|---|
| The pitch ramp | **Stops dead** on the frame of the release. No release envelope, no tail |
| The bed | Ducks to a defined floor, also as a cut |
| Reverb / delay tails | **Frozen**, not left ringing. A tail that rings through hitstop turns the punch into a smear |
| Resume | On the frame the world resumes, as a cut |

Attack ≤ 2 frames; decay ≥ 10 × attack (spec [00](./00-tokens.md) §5) applies to envelopes as
literally as it applies to light.

## 4 · The voices

| Voice | Fires on | Character |
|---|---|---|
| **Grab** | Grab | A closing. Low, short, resolved — the mirror of the release, at lower amplitude, as the camera kick is |
| **Boost ramp** | Held orbit | §2 |
| **Aim voice** | Held orbit | §2 |
| **Release** | Release, after the hitstop cut | Pitched by **tier**: make, TRUE, SHARP, PERFECT, four distinct heights on one interval ladder. Same law as the callouts — the ladder is ordinal, and it never changes timbre to mean "better" |
| **Streak** | A streak's `×N` incrementing | The same release voice, transposed up one step per link, capped where the callout's multiplier caps |
| **Chain** | Chain milestones ×5, ×10, ×15 | **Layers an instrument into the bed.** It does not play a cue; the bed gets richer. The number is the callout, and the instrument is the reward |
| **Boundary** | Inside the outer and fire bands | A bed voice whose intensity tracks **closing speed**, exactly as the gradient's bloom does (spec [07](./07-boundary.md)). Skimming is quiet; diving is loud |
| **Deadline** | The deadline window live | A pulse on the window, and a distinct tone at the dot. States when saving stops being possible — never "press now" |
| **Burn** | A save | The carve, with a tail. The one place the player's own voice distorts |
| **Death** | Crossing the line | `SOS` strobe has a voice at 2Hz. **It stops at the line.** The silence after the last strobe is the loudest moment in the game and must be genuinely silent — no bed, no tail, no room |
| **Carpet** | The finish | The bed opens up. The surge at 50% is audible. **No hitstop at the crossing**, so no cut (spec [12](./12-finish.md)) |
| **Card tally** | Debrief and results rows | A tick per row at ~120ms. Arcade scoreboards count |

## 5 · The bed

| Property | Rule |
|---|---|
| Tempo | Fixed per day, so a day has a tempo the way it has a name |
| Beat grid | Exposed to the simulation, so a release can be **quantised in feedback, never in effect**: the sound may land on the beat; the physics never waits for one |
| Layering | Chain milestones add layers; an anomaly swaps the bed's palette, as it swaps the sky's |
| Anomaly | The only event permitted to repaint the sky is also the only one permitted to repaint the bed |
| ZEN | The bed and the graded voices survive. There is no bank, no fuel, no deadline, so their voices are absent |

## 6 · Determinism and the layers

Audio is **driven by presentation state** and lives in neither the simulation nor the renderer
(ADR-0006). It reads the same per-tick derived values the renderer reads, and owns nothing but its
own scheduling.

- **The simulation never waits for audio.** It does not know audio exists.
- **Audio must not measure itself in seconds against the simulation.** Simulated time and
  wall-clock time diverge across hitstop; anything that schedules against wall-clock will drift out
  of the picture at exactly the moment the picture is punching hardest.
- A run played with audio and the same run played muted produce identical simulation state and
  identical scores.

## 7 · Constraints

- **Everything is synthesised or bundled.** ADR-0010 ships a static site with no backend; no audio
  is fetched at runtime from anywhere but the bundle.
- **Silence is a legal state and must be handled.** iOS will not start audio without a user
  gesture; the first press is that gesture, and the game must be fully playable before it and
  identical after it.
- A muted device loses nothing but the teaching. Every fact audio states is also stated by an
  instrument.

## Acceptance

- The pitch ramp's peak coincides with the boost envelope's peak, to within one tick, at every
  orbit radius and speed.
- Recording the ramp across a shaped dive and a lazy one, the two-voice convergence is measurably
  different — the shaped dive reaches unison at the dot and the lazy one does not.
- Across the 70ms hitstop, no audio buffer advances and no tail rings.
- A run replayed from its recipe produces an identical audio event log, tick for tick.
- A run flown muted and the same recipe flown with audio produce identical final banks.
- The 900ms after the last SOS strobe contains no sample above the noise floor.
- ZEN's build schedules no bank, fuel or deadline voice.
