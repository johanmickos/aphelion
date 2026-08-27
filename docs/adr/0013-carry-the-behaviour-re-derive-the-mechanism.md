# Carry the behaviour; re-derive the mechanism

[ADR-0001](./0001-separate-repository-from-the-prototype.md) rules that no file is copied and
that a spec needing a fact from the prototype states the fact. Writing
[spec 01](../spec/01-swing.md) showed that this is not enough of a rule, because it does not say
*what kind of fact*. The first draft stated several of them as the prototype's mechanism — a
formula in its config keys, a quantity named after its variable — which is a copy with the
characters changed, and it would have shaped this codebase into the one we left.

**The rule is: carry what the prototype does, re-derive how it does it.** What is worth keeping
is behaviour, and behaviour is what a test can observe from outside the simulation — positions,
speeds, times, angles, ratios. How the prototype arrives there is its own history, usually shaped
by abandoned attempts and by keys that outlived their reasons, and it is the part of it we are
deliberately not inheriting.

**A mechanism crosses only when the behaviour cannot be stated without it.** There are such cases
and they are the important ones. Spec [01 · §6a](../spec/01-swing.md) is the worked example: at
the freeze the orbit's *shape* is clamped while the dive's *speed* is carried uncapped, which is
physically inconsistent and is the only channel by which the quality of a dive survives into the
orbit. Correcting it is the obvious refactor and it would destroy the game. So the spec records
the inconsistency — and still states the contract as three things a test can measure, so the
rewrite is free to produce them any way it likes.

**Consequence.** We give up the prototype's own proof technique. It held an equality gate at
exactly zero divergence, which is only available to a port, and ADR-0004 already traded that away
for determinism plus the author's judgement. What we get instead is that every characteristic is
falsifiable at the layer boundary, so the tests survive refactors, the simulation can be
restructured without rewriting its suite, and no module ends up shaped like a file in a repository
nobody here will be able to open in a year.

**And it binds forward.** M2 faces the same question with the compass, M4 with the economy. The
answer is the same each time: state what a reader of the screen or a reader of the score can
observe, and let this codebase find its own way there.
