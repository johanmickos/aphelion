/**
 * The fuel warning that flashes beside the ship.
 *
 * The gauge in the corner has always known the tank was low; the player's eyes
 * have never been on it. Every cue for an empty tank lived in the bottom-left
 * corner or in the readout under the score, and the one moment they matter is the
 * moment nothing else on screen is worth looking at — the ship stopped rounding
 * out, or the grab did nothing, and the reason was two hundred pixels away.
 *
 * So it flashes where the player is already looking. Three pulses, once, on the
 * transition — never a standing badge. A permanent icon beside the ship would
 * ride along through 5% of a session (measured: the tank sits below LOW for 4.7%
 * of ticks across 60 minutes of recordings) and become part of the ship's
 * silhouette, which is the opposite of a warning.
 *
 * WHAT IT IS: the corner gauge, miniaturised and drawn empty. It is deliberately
 * the same object rather than a new symbol to learn — the shape says "fuel", the
 * colour says how bad, and the word says which. Both colours come from
 * `FUEL_RAMP`, so the badge and the gauge cannot drift apart.
 */
import type { SimConfig } from '../sim/config.ts';
import { FUEL_LOW_FRAC, FUEL_RAMP } from './hud.ts';
import type { WarningLight } from './warnings.ts';
import type { RenderSnapshot } from './snapshot.ts';

/** Yellow warns, red explains. */
export type FuelWarningKind = 'low' | 'empty';

/**
 * How much of the tank has to come back before the warning can fire again.
 *
 * Fuel regenerates while drifting, so a tank hovering on the line would otherwise
 * re-cross it every second or so and flash forever. Measured over 54 recordings,
 * the low warning fires 1.18 times per minute with this hysteresis in place —
 * roughly once per fifty seconds, which is a warning rather than a tic.
 */
const LOW_REARM_FRAC = 0.4;

/**
 * Fuel the tank has to recover before an empty warning can fire again.
 *
 * The same number `beginCapture` refuses a grab under, so the badge re-arms
 * exactly when a grab becomes possible again and not before.
 */
const EMPTY_REARM = 0.5;

/** Pulses per flash, and how long one pulse lasts. */
const PULSES = 3;
const PULSE_SEC = 0.36;

/**
 * The miniature gauge: the corner gauge, shrunk and drawn empty.
 *
 * Deliberately the same object rather than a new symbol to learn — the shape says
 * "fuel", the colour says how bad, and the word says which.
 *
 * WHERE IT GOES IS NO LONGER HERE. It used to carry its own `DROP` below the ship
 * and its own label metrics, with a note explaining that below is the only free
 * direction because score popups rise straight up. That reasoning was right and
 * has moved to `warnings.ts`, which now makes the decision once for every light
 * instead of once per cue. `h` is gone with it: the panel sets the row height.
 */
const GLYPH = { w: 9, pills: 4, gap: 1.5, radius: 1.5 } as const;

interface Style {
  color: string;
  word: string;
  /** Pills lit in the miniature gauge. Empty means empty. */
  lit: number;
}

const STYLE: Record<FuelWarningKind, Style> = {
  // FUEL_RAMP's yellow (its "half" step) and its red (its "empty" step). Taking
  // both from the gauge's own palette is what keeps the two cues one cue.
  low: { color: FUEL_RAMP[3]!, word: 'LOW', lit: 1 },
  empty: { color: FUEL_RAMP[0]!, word: 'EMPTY', lit: 0 },
};

/**
 * Watches the tank and flashes on the transitions that changed what happened.
 *
 * An observer of the snapshot, like `Trail`: it is fed on the fixed tick so a
 * dip below the line cannot be missed between two frames, and aged on the frame
 * delta so three flashes look like three flashes on a 120Hz screen.
 */
export class FuelWarning {
  private kind: FuelWarningKind | null = null;
  private t = 0;
  private prevFuel: number | null = null;
  private armLow = true;
  private armEmpty = true;
  private lastGrabTick = -1;

  clear(): void {
    this.kind = null;
    this.t = 0;
    this.prevFuel = null;
    this.armLow = true;
    this.armEmpty = true;
    this.lastGrabTick = -1;
  }

  /** For tests and for the diagnostics trace; not part of drawing. */
  live(): FuelWarningKind | null {
    return this.kind;
  }

  /**
   * Call once per simulation tick.
   *
   * Three transitions earn a flash, and nothing else does:
   *
   *  - crossing DOWN through the gauge's own LOW line, which is the warning;
   *  - running the tank dry, which is the explanation — a capture that puttered
   *    out mid-circularisation and a flyby brake that quit both land here, and
   *    both are the "why did I suddenly stop" the player is owed;
   *  - a grab refused for an empty tank, which is the one case where the game
   *    genuinely ignored an input.
   *
   * The refused grab has never once happened in 60 minutes of recorded play —
   * fuel regenerates during the drift you would be tapping from, so the tank is
   * rarely still empty by the time you reach the next planet. It is here because
   * it is the case where the player has no other cue at all, and because the
   * result is typed: adding a way to refuse a grab makes the compiler ask
   * whether it belongs.
   */
  observe(snap: RenderSnapshot, cfg: SimConfig): void {
    // The crash freeze is its own message. A tank that ran dry on the way into a
    // planet does not get to explain the planet.
    if (snap.ending.active) {
      this.prevFuel = snap.fuel;
      return;
    }

    const prev = this.prevFuel;
    this.prevFuel = snap.fuel;
    const frac = snap.fuel / cfg.fuelMax;

    if (snap.fuel > EMPTY_REARM) this.armEmpty = true;
    if (frac > LOW_REARM_FRAC) this.armLow = true;

    // A respawn refills the tank in one tick; there is no crossing to report.
    if (prev === null) return;

    const g = snap.lastGrab;
    const newGrab = g !== null && g.tick !== this.lastGrabTick;
    if (g) this.lastGrabTick = g.tick;

    const ranDry = prev > 0 && snap.fuel <= 0;
    const refused = newGrab && g!.result === 'refused-no-fuel';
    if (this.armEmpty && (ranDry || refused)) {
      this.flash('empty');
      this.armEmpty = false;
      this.armLow = false;
      return;
    }

    const crossedLow = prev / cfg.fuelMax > FUEL_LOW_FRAC && frac <= FUEL_LOW_FRAC;
    if (this.armLow && crossedLow) {
      this.flash('low');
      this.armLow = false;
    }
  }

  /** Restart the flash. A worse warning always interrupts a better one. */
  private flash(kind: FuelWarningKind): void {
    this.kind = kind;
    this.t = 0;
  }

  /** Call once per rendered frame. Not while paused — see `Scene.draw`. */
  update(dt: number): void {
    if (this.kind === null) return;
    this.t += dt;
    if (this.t >= PULSES * PULSE_SEC) this.kind = null;
  }

  /**
   * The light this badge is showing, or null when it is not flashing.
   *
   * IT NO LONGER DRAWS ITSELF, and that is the point of the panel: where a
   * warning goes, how wide its plate is and how its word is set are one decision
   * made in one place, not a decision each cue makes again. What is left here is
   * the only part that was ever this file's own — WHEN to warn, and what the
   * miniature gauge looks like.
   *
   * Anchored to the live ship position rather than to where the tank ran dry —
   * still true, and now `warnings.ts` is what anchors it: this reports the state
   * of the ship, and a marker left behind at speed reads as debris rather than as
   * a warning.
   */
  light(): WarningLight | null {
    if (this.kind === null) return null;
    const alpha = pulseAlpha(this.t);
    if (alpha <= 0) return null;
    const style = STYLE[this.kind];
    return {
      kind: 'fuel',
      alpha,
      color: style.color,
      word: style.word,
      glyphW: GLYPH.w,
      glyph: (ctx, x, y, w, h, s) => {
        // The miniature gauge, drawn the way the real one is: pills that are lit
        // or not, never a bar drawn part-height.
        const slot = h / GLYPH.pills;
        const pillH = slot - GLYPH.gap * s;
        const bottom = y + h;
        const was = ctx.globalAlpha;
        for (let i = 0; i < GLYPH.pills; i++) {
          ctx.globalAlpha = was * (i < style.lit ? 1 : 0.16);
          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.roundRect(x, bottom - i * slot - pillH, w, pillH, GLYPH.radius * s);
          ctx.fill();
        }
        ctx.globalAlpha = was;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1.4 * s;
        ctx.strokeRect(x, y, w, h);
      },
    };
  }
}

/**
 * Three flashes, not a sine wave.
 *
 * A pulse snaps on, holds long enough to be read, then falls away to nothing
 * before the next one starts — so the badge is countably three flashes rather
 * than a glow that breathes, which is what everything else on screen already
 * does (the boost halo, the gauge's own LOW). Exported for the test that pins the
 * count.
 */
export function pulseAlpha(t: number): number {
  if (t < 0 || t >= PULSES * PULSE_SEC) return 0;
  const u = (t % PULSE_SEC) / PULSE_SEC;
  if (u < 0.08) return u / 0.08;
  if (u < 0.5) return 1;
  if (u < 0.8) return (0.8 - u) / 0.3;
  return 0;
}

export const FUEL_WARNING = { PULSES, PULSE_SEC, LOW_REARM_FRAC, EMPTY_REARM } as const;
