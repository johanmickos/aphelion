# Three layers: simulation, presentation state, renderer

The design puts a 70ms full world freeze at both grab and release, a camera kick along
the exit tangent, craft deformation, decaying award words and a four-step energy channel
into the middle of the game. Left to the renderer, none of that is reproducible, and the
only way to check any of it is to look at it.

So the game is three layers rather than two. The **simulation** is pure and headless —
bodies, gravity, the craft, grab and release, death — and it owns the only clock in the
game: ticks. Hitstop is a time-scale the simulation applies, not a pause the renderer
performs, so wall-clock time and simulated time may diverge and nothing in the game is
allowed to measure itself in seconds. **Presentation state** is derived from the
simulation, per tick, and is equally pure and deterministic: energies, bloom radii,
deformation, camera offset, live awards, boundary heat. The **renderer** draws
presentation state and owns nothing but pixels and the interpolation between ticks.

**Consequence**: a frame is a pure function of `(recipe, tick)`, so an agent with no
canvas can assert that the camera is offset 6px along the tangent at tick 412, and a
look can be regression-tested with a golden rather than an opinion. The cost is a layer
that has to be kept honest — the portability check that proves the simulation imports
nothing must be extended to cover presentation state, or it will quietly grow a
dependency on the renderer.
