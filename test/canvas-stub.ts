/**
 * A recording 2D context. Captures every call and property set so tests can
 * assert on what was drawn without a browser.
 *
 * This is also the seed of the draw-trace used by the diagnostics capture: the
 * same recording, armed for a frame and dumped.
 */
export type Op = [string, ...unknown[]];

export interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  ops: Op[];
  /** Ops of one kind, e.g. calls('fillRect'). */
  calls(name: string): Op[];
  reset(): void;
}

export function recordingContext(): RecordingContext {
  const ops: Op[] = [];
  const gradient = { addColorStop: (): void => {} };

  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return (...a: unknown[]) => {
          ops.push([`=${k}`, ...a]);
          return gradient;
        };
      if (k === 'canvas') return { width: 0, height: 0 };
      if (k in t) return t[k];
      return (...a: unknown[]) => {
        ops.push([k, ...a]);
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      ops.push([`=${k}`, v]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    ops,
    calls: (name) => ops.filter((o) => o[0] === name),
    reset: () => {
      ops.length = 0;
    },
  };
}
