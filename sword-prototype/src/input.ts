import { CONFIG } from "./config";

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
 *
 * Everything here listens to **pointer** events rather than mouse events, and
 * that is not a matter of taste. Babylon attaches its own input manager to the
 * canvas and calls `preventDefault()` on `pointerdown` (`preventDefaultOnPointerDown`
 * defaults to true). Cancelling `pointerdown` suppresses the compatibility mouse
 * events for that pointer's whole gesture -- so `mousedown`, `mousemove` and
 * `mouseup` all stop firing the instant any button goes down. The symptom is
 * that holding a button freezes the arm *and* the button itself does nothing,
 * which reads as two bugs and is one.
 */

export interface InputState {
  /** -1 back, +1 forward. */
  forward: number;
  /** -1 left, +1 right. */
  strafe: number;
  /** -1 left, +1 right. Non-zero also means "I am steering", which breaks a lock. */
  turn: number;
  /** Cursor position across the window, -1 (left) to +1 (right). */
  pointerX: number;
  /** Cursor position up the window, -1 (bottom) to +1 (top). */
  pointerY: number;
  /**
   * Wrist roll in radians. Absolute, not a per-frame delta, because the control
   * loop runs several times per rendered frame and would otherwise apply the
   * same increment more than once.
   */
  roll: number;
  /** Camera zoom factor, multiplied into the camera's distance and height. */
  zoom: number;
  thrust: boolean;
  guard: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export interface ControlHooks {
  onReset: () => void;
  onToggleReadout: () => void;
  onPause: () => void;
  onToggleLock: () => void;
  /** Return true to swallow the click -- used when it picked a target instead
   *  of starting a thrust. */
  onPrimaryDown: () => boolean;
}

export class Controls {
  readonly state: InputState = {
    forward: 0,
    strafe: 0,
    turn: 0,
    pointerX: 0,
    pointerY: 0,
    roll: 0,
    zoom: 1,
    thrust: false,
    guard: false,
  };

  private readonly held = new Set<string>();
  private active = false;
  private zoomNotches = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: ControlHooks,
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
    // Chrome opens its autoscroll widget on a middle click, which captures the
    // pointer and stops delivering movement until it is dismissed.
    window.addEventListener("auxclick", this.onAuxClick);
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

  /** Fold held keys into axes. Call once per rendered frame. */
  sample(dt: number): InputState {
    const axis = (negative: string, positive: string) =>
      (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);

    this.state.forward = axis("KeyS", "KeyW");
    this.state.strafe = axis("KeyA", "KeyD");
    this.state.turn = axis("KeyQ", "KeyE");

    const A = CONFIG.arm;
    this.state.roll = clamp(
      this.state.roll + axis("KeyZ", "KeyX") * A.rollRate * dt,
      A.rollMin,
      A.rollMax,
    );

    const C = CONFIG.camera;
    const wanted = clamp(Math.exp(this.zoomNotches * C.zoomStep), C.zoomMin, C.zoomMax);
    this.state.zoom += (wanted - this.state.zoom) * (1 - Math.exp(-C.zoomResponse * dt));
    return this.state;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("auxclick", this.onAuxClick);
  }

  private readonly onAuxClick = (event: MouseEvent): void => {
    if (this.active) event.preventDefault();
  };

  private readonly onContextMenu = (event: Event): void => {
    // The right button is the guard, so it must not raise a menu mid-fight.
    if (this.active) event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      if (this.active) this.held.add(event.code);
      return;
    }
    switch (event.code) {
      case "Tab":
        event.preventDefault();
        this.hooks.onToggleReadout();
        return;
      case "Escape":
        this.hooks.onPause();
        return;
      case "Space":
        event.preventDefault();
        this.hooks.onReset();
        return;
      case "KeyL":
        if (this.active) this.hooks.onToggleLock();
        return;
      default:
        if (this.active) this.held.add(event.code);
    }
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

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" && !event.isPrimary) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.state.pointerX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    // Screen Y grows downward; the arm does not.
    this.state.pointerY = clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.active) return;
    if (event.button === 0) {
      // A click can be a thrust or a target pick, and only the caller knows which.
      if (!this.hooks.onPrimaryDown()) this.state.thrust = true;
    }
    if (event.button === 2) this.state.guard = true;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) this.state.thrust = false;
    if (event.button === 2) this.state.guard = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    this.zoomNotches = clamp(this.zoomNotches + Math.sign(event.deltaY), -18, 18);
  };
}
