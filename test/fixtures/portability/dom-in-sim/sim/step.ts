export interface SimState {
  tick: number;
}
export function stepSim(state: SimState): void {
  state.tick += 1;
  document.title = String(state.tick);
}
