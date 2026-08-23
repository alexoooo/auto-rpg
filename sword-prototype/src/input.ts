import { CONFIG } from "./config";
import { AUXILIARY, maskOfButton, nextSpent, poseFromButtons, PRIMARY } from "./buttons";

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
 *
 * The buttons themselves are read as *levels*, never as edges. Whether the
 * guard is up is a state of the hand, so it is derived from `event.buttons` --
 * the live bitmask every pointer event carries -- on `pointerdown`,
 * `pointermove` and `pointerup` alike, by `src/buttons.ts`. Counting presses
 * against releases instead is wrong forever after the first release the browser
 * declines to deliver, which is what left the arm stuck in a guard with nothing
 * held. Only the actions are edge-triggered, because they must fire once per
 * press rather than for as long as a finger rests on a button: the target pick
 * on the left button and the lock toggle on the middle one.
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
  /** `Space`: build the bout again from nothing, both fighters. */
  onReset: () => void;
  onToggleReadout: () => void;
  onPause: () => void;
  /** The rig overlay: what the solver is holding, over the top of the costume. */
  onToggleRig: () => void;
  /** Overhead or Fixed: whether the camera's bearing belongs to the fighter or to
   *  the world. */
  onToggleCamera: () => void;
  /** Swing the Fixed camera's bearing one step, -1 or +1. */
  onRotateCamera: (direction: number) => void;
  onToggleLock: () => void;
  /** `C`: arm the takeover, or drop it again. The click that follows takes a
   *  body rather than starting a thrust. */
  onToggleTakeover: () => void;
  /** Return true to swallow the click -- used when it picked a target or took a
   *  body instead of starting a thrust. */
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

  private readonly canvas: HTMLCanvasElement;
  private readonly hooks: ControlHooks;

  private readonly held = new Set<string>();
  private active = false;
  private zoomNotches = 0;
  /** Buttons whose current press has already been paid out as an action. */
  private spent = 0;

  // Fields and assignments rather than constructor parameter properties, here
  // and everywhere else in this directory. Node 24 runs a `.ts` file by
  // stripping its types, which is what lets `tests/` import the simulation
  // modules directly, and strip-only mode rejects a parameter property outright
  // -- it is a parse error rather than a warning. One of them anywhere in an
  // import graph makes the whole graph unloadable from a test.
  constructor(canvas: HTMLCanvasElement, hooks: ControlHooks) {
    this.canvas = canvas;
    this.hooks = hooks;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    // A tab hidden mid-hold is a lost release under another name: no `pointerup`
    // is ever delivered for a button let go while the page is in the background.
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
    // Chrome opens its autoscroll widget on a middle click, which captures the
    // pointer and stops delivering movement until it is dismissed. That matters
    // more now that the middle button toggles the lock and players will use it.
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
    this.openHand();
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
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
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
      case "KeyG":
        // Gated on `active` like the lock, and for the same reason: the overlay
        // reads live rig state, and while the fight is paused the curtain is
        // over the arena anyway, so there is nothing behind it to look at.
        if (this.active) this.hooks.onToggleRig();
        return;
      case "KeyV":
        // Gated on `active` like `G` and `L`. Nothing about the camera is
        // dangerous to change behind the curtain, but the curtain is over the
        // arena, so a switch taken there is a switch you cannot see -- and the
        // whole of what the key is for is watching the change happen.
        if (this.active) this.hooks.onToggleCamera();
        return;
      case "BracketLeft":
        if (this.active) this.hooks.onRotateCamera(-1);
        return;
      case "BracketRight":
        // Held-down repeats never reach this switch -- `event.repeat` is answered
        // above -- so leaning on the key does not spin the arena, which is what a
        // stepped control wants and what a continuous one would not care about.
        if (this.active) this.hooks.onRotateCamera(1);
        return;
      case "KeyL":
        if (this.active) this.hooks.onToggleLock();
        return;
      case "KeyC":
        // Gated on `active` like `G`, `V` and `L`, and for the strongest version
        // of the same reason: the whole gesture is a click on a body, and behind
        // the curtain there is a curtain where the bodies are. Which fighter is
        // yours is editable there anyway, by the radio buttons on the setup
        // screen, so nothing is lost by the mode not existing.
        if (this.active) this.hooks.onToggleTakeover();
        return;
      default:
        if (this.active) this.held.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** Losing focus mid-stride must not leave the fighter walking forever. */
  private readonly onBlur = (): void => {
    this.held.clear();
    this.openHand();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.onBlur();
  };

  /** Drop everything the hand was holding, and forget what it had paid for. */
  private openHand(): void {
    this.spent = 0;
    this.state.thrust = false;
    this.state.guard = false;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" && !event.isPrimary) return;
    this.applyButtons(event);

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.state.pointerX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    // Screen Y grows downward; the arm does not.
    this.state.pointerY = clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.active) return;

    // Chrome opens its autoscroll widget on a middle press, and once it is up it
    // captures the pointer and stops delivering movement until it is dismissed.
    // Cancelling `auxclick` below is too late to stop it -- that fires after the
    // release -- so the middle press has to be cancelled here, at the edge that
    // actually opens the widget. The documented cost of cancelling `pointerdown`
    // is that the compatibility mouse events stop arriving for the rest of the
    // gesture, which is free: nothing in this file listens for them.
    if (event.button === 1) event.preventDefault();

    // A press is proof that whatever the last press of this button owed has been
    // settled, however its release went missing, so it starts again unspent.
    const arriving = maskOfButton(event.button);
    this.spent &= ~arriving;

    // Narrowed to the one button that just arrived, the pose describes this edge
    // rather than the whole hand: what is this press, on its own, asking for?
    const pressed = poseFromButtons(event.buttons & arriving, this.spent);
    let swallowed = 0;
    // A click can be a thrust or a target pick, and only the caller knows which.
    if (pressed.thrust && this.hooks.onPrimaryDown()) swallowed |= PRIMARY;
    if (pressed.lockToggle) {
      this.hooks.onToggleLock();
      swallowed |= AUXILIARY;
    }

    this.applyButtons(event, swallowed);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.applyButtons(event);
  };

  /**
   * The browser has taken the pointer away, so nothing further will be
   * delivered for this gesture -- not even the releases. `pointercancel`
   * reports its `button` as -1, which is exactly why aliasing it to the
   * `pointerup` handler used to clear nothing at all.
   */
  private readonly onPointerCancel = (): void => {
    this.openHand();
  };

  /**
   * Take the pose from the buttons held now, less what those presses have
   * already been spent on. Called from every pointer event, because the point
   * of reading a level is that any event at all can repair it.
   */
  private applyButtons(event: PointerEvent, swallowed = 0): void {
    if (!this.active) {
      // Paused, so the hand is not the player's to hold. Pressing a button over
      // the curtain must not be waiting in the pose when the fight resumes.
      this.openHand();
      return;
    }
    this.spent = nextSpent(this.spent, event.buttons, swallowed);
    const pose = poseFromButtons(event.buttons, this.spent);
    this.state.thrust = pose.thrust;
    this.state.guard = pose.guard;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    this.zoomNotches = clamp(this.zoomNotches + Math.sign(event.deltaY), -18, 18);
  };
}
