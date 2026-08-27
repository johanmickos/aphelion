# Mobile portrait is the design target; the game ships as a static site

Direction 03 states the design space as 1170×2532 — a phone in portrait — and reserves the
bottom third of the screen as thumb zone where nothing readable may live. Every composition
in the design set assumes it, and the author's judgement of feel is made on a phone reached
by scanning the dev server's QR code.

So the game is authored for mobile portrait and everything is drawn in world space in
design coordinates, identical on every device. Desktop is a supported platform rather than
a designed one: same world coordinates, letterboxed, with mouse and keyboard bound to the
same single verb — which matters because that is where nearly all iteration happens.

It ships as a static bundle on GitHub Pages with a relative base path, and there is no
backend (see ADR-0003). Installable-PWA behaviour and any app store presence are non-goals.
