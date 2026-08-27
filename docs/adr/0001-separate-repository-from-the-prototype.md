# Separate repository; the prototype is consulted, never ported

Aphelion has a working prototype at `~/git/aphelion` — roughly 17.7k lines of
TypeScript with a frozen physics golden, a ten-scenario equality gate and a replay
toolchain. This project deliberately does not inherit any of it. Carrying the code
across would carry its architecture across too, and the point of the rewrite is to
build for the complete design rather than to extend a design that was discovered
incrementally.

The prototype stays where it is, unmodified, and is consulted as reference material:
for how the swing feels, for measurements taken from real recorded sessions, and for
apparatus worth rebuilding. No file is copied. A specification that needs a fact from
the prototype states the fact; it does not link the line.

**Consequence**: the prototype is a wasting asset. Everything we need from it has to be
written down here, because the day it stops being checked out is the day it stops being
consultable.
