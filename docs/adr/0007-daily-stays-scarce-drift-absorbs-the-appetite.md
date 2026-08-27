---
status: accepted (amends ADR-0005)
---

# DAILY stays one-shot; DRIFT absorbs the appetite to keep playing

Direction 11 builds retention out of scarcity: one field, one run, a reseed countdown,
and no retry — you come back tomorrow because you cannot come back today. That argument
only works if the run really is unrepeatable, and Direction 09's DAILY debrief is built
on it, down to replacing the retry verb with SHARE.

But scarcity has an obvious failure: die twenty seconds in and there is nothing to do
until tomorrow. ZEN, the design's own answer, has no score, so it does not scratch that
itch. Rather than soften DAILY with lives — which would put resume state, respawn rules
and a re-priced wager inside the one mode that also carries the standings and the share
artifact — the generosity goes into a third mode. **DRIFT** is the same run on a random
seed: unlimited, no standings, no submission, its own local best.

v1 therefore ships three modes: DAILY, ZEN and DRIFT. DRIFT is nearly free once DAILY
exists — a different seed source and no submission — and it keeps the one part of the
design whose entire argument is scarcity intact.
