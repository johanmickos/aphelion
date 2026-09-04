# M4 · Handover

Written at the end of the session that built M4, for the session that picks it up. What M4 *did*
is [`m4-the-economy.md`](./m4-the-economy.md)'s own step notices and the specs' ⚠ notices; this
file is only the things that are true about **the state of the work** and would otherwise have to
be rediscovered.

---

## 1 · Where the code is

**Branch `m4-the-economy`, six commits, rebased onto `v2` and `pnpm check` green** (1 130 tests,
77 files). It is **not merged**.

The reason it is not merged is worth knowing rather than guessing at. `v2` moved while M4 was in
flight — the author landed **`37f0713` the picture stops sliding sideways** and **`1ee2b9f` the
ceiling is the rasteriser, not the language** — so `git merge --ff-only` refused, which is
[AGENTS.md](../../AGENTS.md) §1.2 working rather than failing. The branch has been **rebased onto
`v2`**, the rebase was clean (no conflicts in six commits), and `pnpm check` is green on the result,
including `pnpm scenarios` and a `pnpm bench` rebuild that produced no diff.

So the merge is:

```
git checkout v2 && git merge --ff-only m4-the-economy && git branch -d m4-the-economy
```

⚠ **Check `v2` has not moved again first.** If it has, rebase again rather than merging with a
commit — one branch, fast-forward only.

⚠ **`37f0713` is adjacent to M4.5's own work and the two agree.** It builds spec 00 §7's *second*
guardrail — the cap on the extra — inside `visible`, which is what is **drawn**. M4.5 placed the top
band against §7's *first* guardrail, the **guaranteed band**, which is what is **composed**. Neither
touches the other's number, and the rebase confirmed it: nothing conflicted and the HUD's own
assertions still hold. If either is revisited, they are two different sentences in one section.

The branch has also been pushed to `origin` as `m4-the-economy`, at the author's request. ⚠ That is
a **deliberate exception** to AGENTS.md §1.2's *"no remote, no push"*, asked for in the session; the
rule is otherwise unchanged and nothing else was pushed.

---

## 2 · The gate is open and it is the next thing

**The author flies it. The question is whether the wage feels like it matches the swing.** A gated
step stops (ADR-0004): do not start M5.

What to fly it with:

- `pnpm dev`, and the QR to the phone. `?mode=zen` flies M4.7's subtraction — same field, same
  words, no ledger and no fuel.
- The bench has **one new slider**, `Chain · rungs of coasting that break it`, and it is the one
  that most changes how a run feels. The **retro grade came off** to pay for it; its question was
  ruled on 2026-09-02 and the surface that still asks it is the `TUNE` panel on the game page.
- `pnpm replay <dispatch>` and `pnpm scenarios` both read the economy now.

### The four questions, in the order they are likely to matter

1. **Spec 08 §4's chain break.** One rung is what §4 says, and measured over 222 real
   release-to-grab transitions it survives **10.8%** of links — so the chain reaches 4 across the
   whole corpus, §4's milestones at ×5/×10/×15 are unreachable, and the accrual's multiplier is ×1.0
   or ×1.1 and nothing else. The prototype's own counter has **no distance term** and ran at ×5 – ×7.
   The table is in [`chain.ts`](../../src/state/chain.ts) and in the plan.
2. **Axiom 5 against the band.** 45% of ×2 cashes in the corpus were priced by a boundary that was
   never drawn during the swing, and the gap is geometry: the ×2 band starts 133.5 design units
   before the boundary begins to appear. Three ways out, none taken.
3. **Where the carry's mark resets** — per engagement, which is what *"while engaged"* says. One
   line in [`climbOf`](../../src/state/ledger.ts).
4. **The masthead's height.** It sits at the top of the guaranteed band, which is 291 design units
   below the top of the design space. First element in the game composed that way; a flight answers
   it in a second.

---

## 3 · What M4 did not build, and the wall behind each

Do not pick these up without the wall coming down first.

| Not built | The wall |
|---|---|
| The fuel **charge**, the **refund**, and *"`f = 0` removes the ability to save"* (spec 13 §3, §1) | A save is an ordinary **grab** on this build, and a grab is free (spec 03 §5's notice, the author's own words). Refusing a press is a change to the simulation, so the last of the three moves `SIM_VERSION` — which refuses all 26 replayable dispatches. It lands with spec [07 · §5](../spec/07-boundary.md)'s **burn** |
| ZEN's *"no death, only drifting back"* (spec 08 §7) | Same wall, plus *drifting back* has no specified behaviour to build |
| Spec 13 §5's fuel **percentage label** | A readable element riding the craft; spec 00 §7 forbids anything readable below the thumb line and the camera holds the craft above it by measurement rather than by construction. Wants an author who can see fuel move |
| Spec 06 §3's **merge in place** | Contradicts §4's world-anchored birth and the author's *"a marker left behind at the point of scoring"*; measured at 4 transitions in 114 |
| **DRIFT** | Spec 08 §7's open call — *what death takes in DRIFT* — is the one value a mode carries. Writing the mode is writing the ruling |

⚠ **Nothing in M4 moved `SIM_VERSION` (still 9), `FIXTURE_FIELD_VERSION` (1) or
`SCATTER_FIELD_VERSION` (2).** Every dispatch that replayed before still replays. The four things
queued behind that wall are unchanged and are listed in the M4 prompt and in the specs.

---

## 4 · What a fresh session must not break

- **The economy is composed beside the picture, never inside it.** `derive.ts` may not import
  `ledger.ts`, `fuel.ts` or `economy.ts` and neither may anything it imports;
  `test/state/seam.test.ts` walks the graph. It also holds spec 08 §7's rule about modes: **only the
  ledger and the composition that opens it may name a `Mode`.** When it fails, the fix is a field the
  picture derives — never a relaxation.
- **The cash is triggered by the callout**, which is axiom 5 made structural: the streak, the
  chain's link, the cash and the fuel all read one function, `struckNow`. Do not add a second
  reading of *"a swing was just graded"*.
- **`pnpm scenarios` is in `pnpm check`.** `--record` exists; re-recording without saying why in the
  commit is how a suite stops meaning anything. Its `COVERS` list is the half that rots.
- **The bench is full at 60 of 60.** A new knob costs an old one, and the rule for which is at the
  top of `tools/bench/patches.ts`.
- **Everything the player reads is composed inside the guaranteed band**, not the design space —
  `BAND_TOP` in `src/state/design.ts`. M4.5 learned this the expensive way: the velocity and the
  BANK chip were composed into the 291 design units a phone crops, and only a screenshot found it.

---

## 5 · How to re-derive the numbers

Every measurement in M4's notices came from replaying the corpus with the picture and the economy
folded beside it, which is three imports:

```ts
const sim = openRun(recipe);              // src/sim/replay.ts
let view = createPresentation(sim);       // src/state/derive.ts
let economy = openEconomy(DAILY);         // src/state/economy.ts
// per tick: stepSim → derive → stepEconomy, in that order
```

`test/moments.ts`'s **`pricedRun(recipe, mode)`** does exactly that and returns both series, which
is what every M4 test uses. The corpus is every file in `diagnostics/` that `parseDispatch` accepts
— **26 on this build**, 19 `fixture v1` and 7 `scatter v2`; the rest are refused by their own
version, which is the refusal working.

⚠ **The dispatch count moves.** It was 25 when M4 was briefed and 26 by the time it was built,
because the author flew again. Re-measure rather than quoting; the notices all state their cohort.

---

## 6 · If the author rules on the chain

It is the most likely first answer, so: `CHAIN_BREAK_RUNGS` in
[`chain.ts`](../../src/state/chain.ts) is a **count of rungs** and the bench drives it. Moving it
changes `test/state/chain.test.ts`'s two acceptance numbers (49 m and 51 m at one rung) and the
scenario expectations — `pnpm scenarios --record`, with the ruling quoted in the commit. Spec
08 §4's own sentence and its stale *"25 m"* gloss both want the author's pen at the same time.
