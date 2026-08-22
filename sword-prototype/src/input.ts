/**
 * Input.
 *
 * The mouse belongs to the sword arm, not to the camera. That is the single
 * most important control decision in the prototype and the thing that makes it
 * read as Die by the Sword rather than as a third-person action game: turning
 * is on the keyboard precisely so the mouse can be spent entirely on the blade.
 */

export interface InputState {
  /** -1 back, +1 forward. */
  forward: number;
  /** -1 left, +1 right. */
  strafe: number;
  /** -1 left, +1 right. */
  turn: number;
  /** Mouse movement since the last frame, in raw device units. */
  mouseDx: number;
  mouseDy: number;
  /** Wheel notches since the last frame. */
  wheel: number;
  thrust: boolean;
  guard: boolean;
}

export class Controls {
  readonly state: InputState = {
    forward: 0,
    strafe: 0,
    turn: 0,
    mouseDx: 0,
    mouseDy: 0,
    wheel: 0,
    thrust: false,
    guard: false,
  };

  private readonly held = new Set<string>();
  private locked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: {
      onReset: () => void;
      onToggleReadout: () => void;
      onLockChange: (locked: boolean) => void;
    },
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  get isLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    void this.canvas.requestPointerLock();
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

  /** Zero the deltas. Call after the frame has consumed them. */
  endFrame(): void {
    this.state.mouseDx = 0;
    this.state.mouseDy = 0;
    this.state.wheel = 0;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Tab") {
      event.preventDefault();
      this.hooks.onToggleReadout();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.hooks.onReset();
      return;
    }
    this.held.add(event.code);
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

  private readonly onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.held.clear();
      this.state.thrust = false;
      this.state.guard = false;
    }
    this.hooks.onLockChange(this.locked);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.state.mouseDx += event.movementX;
    this.state.mouseDy += event.movementY;
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (event.button === 0) this.state.thrust = true;
    if (event.button === 2) this.state.guard = true;
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.state.thrust = false;
    if (event.button === 2) this.state.guard = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.locked) return;
    event.preventDefault();
    this.state.wheel += Math.sign(event.deltaY);
  };
}
