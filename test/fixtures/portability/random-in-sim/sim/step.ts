export interface SimState {
  tick: number;
}
export function stepSim(state: SimState): void {
  state.tick += Math.random() > 0.5 ? 1 : 2;
}
