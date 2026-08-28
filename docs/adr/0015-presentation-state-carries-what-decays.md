# Presentation state carries what decays

[ADR-0006](./0006-three-layers-sim-presentation-renderer.md) makes presentation state
*"derived from the simulation, per tick"* and *"equally pure and deterministic"*, and
[M1.2](../plan/m1-the-swing.md#m12--the-simulation-core) implemented that as the strictest
reading available: `derive(sim)` took the simulation and nothing else, and its boundary
test asserted that deriving the same simulation twice gave the same answer. That reading
was right for a layer with nothing in it but positions, and it is wrong for the layer the
design actually describes.

**Almost everything the design puts in this layer decays.** Spec
[02 · §5](../spec/02-release.md) kicks the camera 6px along the exit tangent and homes it
over 180ms *with one overshoot*. Spec [00 · §3](../spec/00-tokens.md) gives E3 a 400ms
decay and rules that only one may be alive at a time. Spec [05 · §3](../spec/05-field.md)
parts the rungs around the craft and relaxes them over ~400ms. Spec
[06](../spec/06-awards.md)'s callouts decay; spec 02's deformation returns. None of those
is a function of the current tick alone: each is a function of the current tick **and what
was already on screen**, which is what "decay" means.

The camera is where it bit first. M1.6 built one with no memory because the criterion
forbade one, recorded that the cost would be *the world sliding with the orbit*, and named
it as the thing to watch at the gate. The gate watched it and it read exactly as predicted.
The fix the prototype spent its own milestone arriving at — ease the camera's subject onto
the body through a settled orbit, and let the weight decay after the release rather than
snapping — cannot be written without remembering the previous tick, and neither can a
camera that eases at all.

So **presentation state is a recurrence: `derive(previous, sim)`**, evaluated exactly once
per tick.

## What is given up, and what is not

What is given up is a property stronger than ADR-0006 ever asked for. What ADR-0006
promises is that **a frame is a pure function of `(recipe, tick)`**, and a recurrence
seeded at tick zero and advanced once per tick satisfies that exactly: replay the recipe,
replay the presentation beside it, and tick 412 is tick 412 on every machine. An agent with
no canvas can still assert where the camera was, which was the whole point.

Three rules keep it true, and each is a test rather than a convention:

1. **Once per tick, never per frame.** Ticks are the only clock in the game (ADR-0006), and
   a decay advanced per frame would run at the display's rate — a 120Hz phone would home
   the camera in half the time a 60Hz one does, and no two recordings of the same recipe
   would agree. The app shell steps the simulation and derives beside it, in the same loop;
   the renderer interpolates between two derived states and never makes a third.
2. **Seeded, not inherited.** A run opens with `createPresentation`, which places everything
   where it belongs on tick zero rather than easing toward it from wherever the last run
   left off. The prototype learned this as a respawn that started by lurching.
3. **Convergent.** Every carried value eases toward something the current tick determines,
   so two presentations that disagree agree again within a bounded time. This is what
   replaces "no memory" as the honest safety property: memory that cannot be shed is memory
   that turns one bad tick into a permanently wrong picture, and a test holds the layer to
   it.

The simulation is untouched by this. It remains pure, headless and memory-free in the
stronger sense, `pnpm portable` still proves it, and a recipe is still the whole
description of a run. What changed is one layer up, where the design always had timers.

## The cost accepted

`derive` can now be called wrongly — twice for one tick, or not at all for one — and the
result is a picture that is subtly desynchronised rather than an error. That is a real
sharp edge and it is why rule 1 is a test. It is accepted because the alternative is worse:
without it, every decaying quantity in the design has to be pushed down into the simulation,
where it would become part of the recipe and part of determinism's contract, and the game's
physics would end up carrying its glow.
