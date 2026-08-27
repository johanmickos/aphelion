# F12 · Audio observer

**Severity** COSTS · **Blocks** VISION's largest named gap · **DEFERRED**

> Deferred until audio starts. The architectural note here is short and the whole
> point of writing it down early is that the tempting implementation is the wrong
> one.

## Why

Confirmed by search: no `AudioContext`, no sound of any kind. VISION calls this
_"the largest single gap in the game"_ and _"the highest gameplay return per hour
available"_, and names the mechanic — a pitch ramp through the boost arc, peaking
at the release window, which _"would teach the core timing better than the gauge
does — and the gauge is the best thing in the game."_

## The one architectural rule

A pitch ramp through the boost arc needs to read `capture.boost` every frame, and
the tempting implementation is for the audio layer to hold a reference to
`SimState`. That is fine in one direction and fatal in the other: anything that
lets audio timing feed **back** — a sound that gates a state change, a scheduler
that advances the simulation, a `requestAnimationFrame` that drives the tick —
ends the property every debugging tool in this repo depends on.

## The shape

**Audio is a second observer, exactly like `src/score/`, and should be built to
the same contract.** The scorer is the proof the pattern works:

- runs after `stepSim`, reads `SimState`, never writes it
- imports from `src/sim/` and nothing else
- no wall clock, no `Math.random`, no DOM

`tools/check-portability.ts` already enforces exactly this for `src/score/` via
`checkDir(dir, label, allowOutside)`. Adding `src/audio/` is one call with the
same arguments — **do that in the first commit**, before there is anything to
police, so the rule is in place from the start rather than retrofitted.

One difference from the scorer, and it is the reason audio is not literally a
copy: the scorer must be reproducible from `(config, seed, inputLog)`, so it is
tick-locked. Audio is _presentation_ and may read the frame clock, interpolate,
and smooth — the same licence `src/render/` has. The ban is on feeding back, not
on knowing the time.

## When it starts

- **The seam already exists.** `scoreTick` returns `{ awards, shouts, tally }` —
  a per-tick event stream that the app already fans out to popups. Audio is a
  second consumer of that same return value, plus a per-frame read of
  `capture.boost` for the continuous ramp.
- **VISION names the target relationship**: _Tetris Effect_ and _Sayonara Wild
  Hearts_ — "a clean release lands on the beat, and a chain that is going well
  layers an instrument in." That is a music system, not a sample bank, and it
  wants deciding before the first sound ships.
- **A performance harness should land first or alongside.** VISION and `IDEAS.md`
  both park one, and audio is exactly the kind of per-frame work that would hide
  behind a good average — "the units that matter are p99 and max, not mean."
