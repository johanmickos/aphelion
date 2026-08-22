/**
 * Contact resolution — one policy function, one resolver.
 *
 * The prototype resolved contacts in three places with three different rules.
 * Writing each as `v -= k * vn * n`, the coefficient k maps to restitution k-1:
 *
 *   grabbed-planet floor   R + minOrbitGap   k=1.0   restitution 0.0   safe
 *   other planet, capture  R + 6             k=1.6   restitution 0.6   safe
 *   drift                  R + 5             k=1.8   restitution 0.8   LETHAL
 *
 * They are the same operation with different constants, so they become rows in a
 * policy rather than three code paths. Numbers are unchanged from the prototype.
 *
 * A shield is therefore a policy flip, not a feature: it clears `lethal` on the
 * drift row, which lands the ship on the bounce branch that already exists.
 */
import type { Body, ContactResponse } from './types.ts';
import type { SimConfig } from './config.ts';

/** Which situation a contact is being resolved in. */
export type ContactSite = 'capture-anchor' | 'capture-other' | 'drift';

/** Ship-side modifiers that can override policy. Empty in Stage 0. */
export interface Effects {
  /** Survive a lethal contact by bouncing instead. Not yet awarded by anything. */
  shield?: boolean;
}

/**
 * Decide how a contact with `body` resolves at `site`.
 * Pure: depends only on its arguments.
 */
export function contactPolicy(
  cfg: SimConfig,
  site: ContactSite,
  body: Body,
  effects: Effects = {},
): ContactResponse {
  switch (body.kind) {
    // An anomaly contacts exactly as a planet does. It is deliberately NOT a
    // softer or safer body: what makes it special is the boundary exemption it
    // projects, not its surface. Flying into one still kills.
    case 'planet':
    case 'anomaly':
      switch (site) {
        case 'capture-anchor':
          return { kind: 'bounce', offset: cfg.minOrbitGap, restitution: 0, lethal: false };
        case 'capture-other':
          return { kind: 'bounce', offset: 6, restitution: 0.6, lethal: false };
        case 'drift':
          return { kind: 'bounce', offset: 5, restitution: 0.8, lethal: !effects.shield };
      }
  }
}

/** The reflect coefficient the prototype applies: `v -= k * vn * n`. */
export function reflectCoefficient(restitution: number): number {
  return 1 + restitution;
}
