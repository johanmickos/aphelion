# Offline first, with the seams cut for an online service

Direction 11 argues retention out of other people: a daily reseed, live standings, a
friend band, and other players' runs raced as ghosts. Direction 10's share code depends
on it too — a twelve-character recipe line cannot contain a compressed input log, so it
can only ever be a handle into a service that holds one.

None of that is built now. `docs/VISION.md` is explicit that nothing should be designed
as though a run were a leg of something longer until the field itself is worth flying
twice, and a leaderboard is the strongest possible form of that assumption. So v1 is
entirely offline: the daily seed derives from the date, standings are the player's own
history, and ghosts are the player's own past runs.

What is built now is the **seam**. The daily seed, the run record and the recipe codec
are defined as boundaries with local implementations behind them, so a service can be
introduced later without touching gameplay. Server-side verification of a submitted run
is replay plus recompute, which the determinism requirement already gives us for free.
