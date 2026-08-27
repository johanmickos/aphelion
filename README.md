# Aphelion

A game about swinging a spacecraft through gravity, where the only thing you do is
decide when to let go.

- [`CONTEXT.md`](./CONTEXT.md) — the glossary. One canonical word per concept.
- [`docs/VISION.md`](./docs/VISION.md) — what the game is for.
- [`docs/design/`](./docs/design/) — twelve design directions; canonical for appearance.
- [`docs/spec/`](./docs/spec/) — canonical for behaviour and numbers ([ADR-0002](./docs/adr/0002-specs-are-canonical-for-behaviour.md)).
- [`docs/adr/`](./docs/adr/) — the decisions, all of them binding.
- [`docs/plan/`](./docs/plan/) — the implementation plan, milestone by milestone.

## Running it

Node 26 or newer, and pnpm.

```sh
pnpm install
pnpm dev      # dev server, bound to all interfaces so a phone can reach it
pnpm check    # typecheck, lint, format check, tests — the gate for every step
pnpm build    # static bundle into dist/
```

## The shape of the repo

`app/` is the Vite root — the page and the shell that drives the game. `src/` is the
game itself, in three layers that do not leak into each other: a pure headless
simulation, a pure presentation state derived from it per tick, and a renderer that
owns nothing but pixels ([ADR-0006](./docs/adr/0006-three-layers-sim-presentation-renderer.md)).
It is empty until M0.3.

There is no backend ([ADR-0003](./docs/adr/0003-offline-first-with-online-seams.md)) and
no installable-PWA or app-store presence ([ADR-0010](./docs/adr/0010-mobile-portrait-target-static-hosting.md)).
The game ships as a static bundle on GitHub Pages, from a relative base path.

A working prototype lives at `~/git/aphelion`. It is consulted and never copied
([ADR-0001](./docs/adr/0001-separate-repository-from-the-prototype.md)).
