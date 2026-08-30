/**
 * What build of the swing a run was flown under.
 *
 * A recipe names the **field** it was flown in ([`recipe.ts`](./recipe.ts))
 * because spec [17 · §2](../../docs/spec/17-daily-field.md) rules that a
 * generator's version is part of its fields' identity. That covers everything
 * about the *world*. It covers nothing about the *swing*: move the eccentricity
 * cap, the settle's length, the boost envelope or — as of 2026-08-28 — how long
 * the clearance takes, and every recipe recorded before the move replays to a
 * different run, in numbers that all look reasonable.
 *
 * [M1.5](../../docs/plan/m1-the-swing.md) recorded that gap rather than papering
 * over it and named this as the place it would land. The first change to the
 * swing after the gate opened is what landed it, which is about as short a
 * deferral as a deferral gets.
 *
 * The prototype paid for the same lesson from the other end: it stores a
 * simulation behaviour version beside its seed because version skew it could not
 * see *"made it look like the simulation had become non-deterministic"*.
 *
 * **Bump it whenever the same recipe would fly a different run**, and
 * `test/sim/version.test.ts` fails until you do: it fingerprints a whole run
 * flown through the one verb, so anything that moves the swing moves it. Old
 * recipes are then refused with their version in the message rather than
 * replayed into a run nobody flew.
 *
 * What it is deliberately **not**: a version of the *code*. A refactor that
 * leaves every tick bit-identical does not touch this, because nothing a recipe
 * describes has changed. The fingerprint is the arbiter, not the diff.
 *
 * **3, on 2026-08-29**: a press now prefers a body up the climb to one below it
 * ([`CLIMB_BIAS`](./units.ts)), so the same log can take a different body. Every
 * dispatch recorded before now is refused with its version in the message, which
 * is the correct outcome and the reason this exists.
 *
 * **4, on 2026-08-29**: the release pays its **transient**. Spec
 * [01 · §8](../../docs/spec/01-swing.md) has measured it since M1.1 — *"×1.8 on
 * release, decaying linearly to nothing over 1.3s"* — and it had never been
 * built, so ADR-0012's punch had its feel and not its speed. The craft now
 * carries a burst beside its velocity for a second or so after letting go, which
 * moves it further in the same direction on the same ray: the route is identical
 * and the timing is not. **Every dispatch recorded before now is refused**, which
 * is a real cost paid deliberately — the alternative was a gate flown on a game
 * the specs describe and the build does not have.
 *
 * **5, on 2026-08-29**: the settle stops erasing the dive. Spec 01 §6a's
 * circularisation eased the orbit's momentum all the way down to the circular
 * speed at its floor, so every settled swing left at the same speed whatever
 * brought it in — measured, exit correlated with approach at **−0.93** and
 * arriving fast paid ×0.83. [`SETTLE_RETURN`](./units.ts) is now 0.30 and the
 * ruling is the author's, on the second asking. It cannot compound: the freeze's
 * escape clamp binds on every dive, so what moved is the setpoint.
 *
 * **6, on 2026-08-30**: the freeze's escape bound is measured at the body's
 * **floor** rather than at the radius the dive stopped at. It read as a speed
 * limit that gets slower the further out you are, so a shallow grab was slammed
 * hardest — traced at up to **−52% in one tick** — and the reason it existed did
 * not bind, because after the freeze the craft rides a phase clock and cannot
 * escape anything. Ruled by the author: *"this is another instance where the real
 * world equations need to be bent, because at the end of the day we're chasing
 * something that feels really good."*
 */
export const SIM_VERSION = 7;
