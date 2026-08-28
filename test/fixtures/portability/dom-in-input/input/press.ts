export interface Press {
  holding: Set<string>;
}
export function bindPress(press: Press): void {
  window.addEventListener('pointerdown', () => press.holding.add('pointer'));
}
