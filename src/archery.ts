/** Physical ranged state shared by the body, observations and command minds. */
export interface RangedCommand {
  target: { x: number; y: number; z: number };
  draw: boolean;
  release: boolean;
}
export interface RangedView {
  phase: "carry" | "raise" | "draw" | "aim" | "recover" | "disabled";
  draw: number;
  ready: boolean;
  clear: boolean;
  shots: number;
}
