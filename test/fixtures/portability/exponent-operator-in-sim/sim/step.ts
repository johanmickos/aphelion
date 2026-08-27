export interface SimState {
  tick: number;
  mass: number;
}
export function stepSim(state: SimState): void {
  state.tick += 1;
  state.mass = 100 * (state.tick / 44) ** 2;
}
