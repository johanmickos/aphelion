# The physics is rewritten; determinism is the contract and the author is the feel gate

The swing is the thing the project is most certain about and most afraid of losing, and
the prototype protected it with a frozen configuration and an equality gate held at zero
divergence. A rewrite discards that protection by definition, and we are rewriting
anyway — the new design changes what a swing costs and pays, and the old physics was
shaped around the old answer.

Two things replace it. First, **determinism as a hard requirement**: a run is fully
described by its configuration, its seed and its input log, the simulation is pure and
runs headless under plain node, and a score is recomputable from a recipe. This is what
makes the new physics testable at all, and it is a precondition for ghosts, for shared
runs and for any future server-side verification. Second, **the author is the gate**:
the physics workstream opens by naming the characteristics of the swing and mapping them
onto the prototype's behaviour, and no implementation of it is accepted until the author
has flown both builds and signed off. A phone, reached by scanning the dev server's QR
code, is where that judgement is made.

**Consequence**: an implementing agent can prove the simulation is correct and
reproducible on its own, and cannot prove it feels right. The sign-off is a scheduled
human checkpoint, not a formality to be routed around.
