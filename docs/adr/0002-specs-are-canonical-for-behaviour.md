# Behaviour specs are canonical; the design boards are canonical for appearance

The twelve design directions in `docs/design/` are argued essays with live components,
15–57KB of HTML each. They are the right medium for deciding what the game looks like
and the wrong one for briefing an implementer, who needs the numbers and the acceptance
criteria without the argument.

So the two split by kind. `docs/design/*.dc.html` is the authority on **appearance** —
open the board to see the thing. `docs/spec/*.md` is the authority on **behaviour and
numbers**, and each spec cites the board it came from. Where two boards disagree, the
spec records the ruling and says which board lost, rather than leaving the reader to
apply the "higher number wins" convention from the design index.

**Consequence**: the boards will drift from the specs as the game is built. That is
accepted. A board is a record of a decision at a moment; the spec is what the game must
do today.
