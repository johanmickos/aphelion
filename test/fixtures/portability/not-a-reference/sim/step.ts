export interface SimState {
  tick: number;
  // A field called `document` is a field, not the DOM.
  document: string;
}
export function stepSim(state: SimState): void {
  state.tick += 1;
  state.document = 'still just a string';
  const shadow = { window: 1, performance: 2 };
  void shadow.window;
  void shadow.performance;
  // A comment naming document, window and Math.random must not be a violation.
}
