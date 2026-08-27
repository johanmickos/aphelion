export interface SimState {
  tick: number;
  phase: number;
}
export function stepSim(state: SimState): void {
  state.tick += 1;
  state.phase = Math.sin(state.tick) + Math.atan2(state.phase, 1);
}
