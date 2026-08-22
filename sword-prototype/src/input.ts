/**
 * Input.
 *
 * The mouse belongs to the sword arm, not to the camera. That is the single most
 * important control decision here and the reason this reads as Die by the Sword
 * rather than as a third-person action game: turning is on the keyboard
 * precisely so the mouse can be spent entirely on the blade.
 *
 * The pointer is deliberately **not** captured. An earlier version took a
 * pointer lock and accumulated relative movement, which meant the arm had no
 * home -- it drifted, you could not find centre again, and you could not leave.
 * Reading the cursor's absolute position instead makes the mapping legible:
 * where the cursor sits in the window is where the hand is asked to be, the
 * middle of the window is always centre guard, and the mouse stays yours.
 */

export interface InputState {
  /** -1 back, +1 forward. */
  forward: number;
  /** -1 left, +1 right. */
  strafe: number;
  /** -1 left, +1 right. */
  turn: number;
  /** Cursor position across the window, -1 (left) to +1 (right). */
  pointerX: number;
  /** Cursor position up the window, -1 (bottom) to +1 (top). */
  pointerY: number;
  /** Cumulative wheel notches. Absolute, not a per-frame delta, so that the
   *  control loop running several times per rendered frame cannot apply it
   *  more than once. */
  roll: number;
  thrust: boolean;
  guard: boolean;
}

const clamp1 = (value: number) => (value < -1 ? -1 : value > 1 ? 1 : value);

export class Controls {
  readonly state: InputState = {
    forward: 0,
    strafe: 0,
    turn: 0,
    pointerX: 0,
    pointerY: 0,
    roll: 0,
    thrust: false,
    guard: false,
  };

  private readonly held = new Set<string>();
  private active = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: {
      onReset: () => void;
      onToggleReadout: () => void;
      onPause: () => void;
    },
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    this.active = true;
  }

  pause(): void {
    this.active = false;
    this.held.clear();
    this.state.thrust = false;
    this.state.guard = false;
  }

  /** Fold held keys into axes. Call once per frame, before reading `state`. */
  sample(): InputState {
    const axis = (negative: string, positive: string) =>
      (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);

    this.state.forward = axis("KeyS", "KeyW");
    this.state.turn = axis("KeyA", "KeyD");
    this.state.strafe = axis("KeyQ", "KeyE");
    return this.state;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  private readonly onContextMenu = (event: Event): void => {
    // The right button is the guard, so it must not raise a menu mid-fight.
    if (this.active) event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Tab") {
      event.preventDefault();
      this.hooks.onToggleReadout();
      return;
    }
    if (event.code === "Escape") {
      this.hooks.onPause();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.hooks.onReset();
      return;
    }
    if (this.active) this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** Losing focus mid-stride must not leave the hero walking forever. */
  private readonly onBlur = (): void => {
    this.held.clear();
    this.state.thrust = false;
    this.state.guard = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.state.pointerX = clamp1(((event.clientX - rect.left) / rect.width) * 2 - 1);
    // Screen Y grows downward; the arm does not.
    this.state.pointerY = clamp1(1 - ((event.clientY - rect.top) / rect.height) * 2);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.active) return;
    if (event.button === 0) this.state.thrust = true;
    if (event.button === 2) this.state.guard = true;
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.state.thrust = false;
    if (event.button === 2) this.state.guard = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    this.state.roll += Math.sign(event.deltaY);
  };
}
