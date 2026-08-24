import { CONFIG } from "./config";
// The hand vocabulary lives in `mind.ts`, not here, and so does the combat
// command itself. The direction of these imports is the point. `mind.ts` is the
// simulation side of the directory and takes only `HumanOwnership` from this
// file, as a **type**, which erases -- so the DOM never enters a headless
// harness's module graph. Declaring `HANDS` here and importing its *value* into
// `mind.ts` reversed that in one line and took `fighter.ts` out of Node's reach
// with it: five test files failed at once with "Cannot find module
// .../src/config", because this file is on the side that does not carry `.ts`
// extensions. `Intent` comes back the same erasing way, and what that buys is in
// `mind.ts`'s comment on it: the fighter decides what a command is, and this
// file states that its controller produces one.
import { HANDS, otherHand, type HandIntent, type HandName, type Intent } from "./mind.ts";

export type { HandIntent, HandName };
import { maskOfButton, nextSpent, poseFromButtons, PRIMARY } from "./buttons";
import { CAMERA_ZOOM_NOTCHES, dragCamera, slewCameraZoom, type CameraGestureState } from "./camera";

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

/** Host-only switches; ownership is not part of the combat command. */
export interface HumanOwnership {
  posture: boolean;
  drivenWrist: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;



export interface ControlHooks {
  /** `R`: build the bout again from nothing, both fighters. */
  onReset: () => void;
  onToggleReadout: () => void;
  /**
   * `Space` and `Esc`: stop the world, or start it again.
   *
   * One hook for both directions rather than a pause and a resume, because the
   * key is a toggle and the thing it toggles -- the curtain and the controller
   * together -- is one state. `main.ts` decides which way it is going, through
   * `pauseAction` in `bout.ts`, which is where the rule lives and is tested.
   */
  onPause: () => void;
  /** Blur/hidden are pause-only edges: receiving both must never resume. */
  onPauseOnly: () => void;
  /** `?`: the controls sheet, over whatever is already on screen. */
  onToggleHelp: () => void;
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
  /** `F`: the mouse changes hands. The one it leaves goes back to its policy. */
  onSwapHands: () => void;
  /** Return true to swallow the click -- used when it picked a target or took a
   *  body instead of starting a thrust. */
  onPrimaryDown: () => boolean;
}

export class Controls {
  readonly ownership: HumanOwnership = { posture: false, drivenWrist: false };
  readonly camera: CameraGestureState = {
    mode: "none", pointerId: null, yaw: 0, pitch: 0, panX: 0, panZ: 0, zoom: 1,
  };
  readonly state: Intent = {
    forward: 0,
    strafe: 0,
    turn: 0,
    driving: "primary",
    posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
    primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
    // The hand the mouse is not on starts at rest, not out in front. It stays
    // wherever it was left the moment `F` moves the cursor off it, which is what
    // `onSwapHands` seeds -- this is only where it begins.
    secondary: {
      pointerX: CONFIG.arm.restPointerX,
      pointerY: CONFIG.arm.restPointerY,
      roll: 0,
      wristBend: 0,
      thrust: false,
      guard: false,
    },
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly hooks: ControlHooks;

  private readonly held = new Set<string>();
  private active = false;
  private zoomNotches = 0;
  /** Buttons whose current press has already been paid out as an action. */
  private spent = 0;
  private cameraX = 0;
  private cameraY = 0;

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
    canvas.addEventListener("lostpointercapture", this.onLostPointerCapture);
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
    this.endCameraGesture();
  }

  /**
   * Fold held keys into axes. Call once per rendered frame.
   *
   * The wheel is folded here too, into `this.camera` rather than into what comes
   * back: the returned command is the fighter's and carries no camera state.
   */
  sample(dt: number): Intent {
    const axis = (negative: string, positive: string) =>
      (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);

    this.state.forward = axis("KeyS", "KeyW");
    this.state.strafe = axis("KeyA", "KeyD");
    this.state.turn = axis("KeyQ", "KeyE");

    const slew = (value: number, wanted: number, rate: number) => {
      const step = rate * dt;
      return value < wanted ? Math.min(wanted, value + step) : Math.max(wanted, value - step);
    };
    const Ctl = CONFIG.controls;
    if (this.ownership.posture) {
      this.state.posture.crouch = slew(
        this.state.posture.crouch, this.held.has("ShiftLeft") ? 1 : 0, Ctl.crouchSlewPerSecond,
      );
      this.state.posture.trunkLean = slew(
        this.state.posture.trunkLean, axis("ArrowDown", "ArrowUp"), Ctl.postureSlewPerSecond,
      );
      this.state.posture.trunkTwist = slew(
        this.state.posture.trunkTwist, axis("ArrowLeft", "ArrowRight"), Ctl.postureSlewPerSecond,
      );
    }
    if (this.ownership.drivenWrist) {
      const hand = this.state[this.state.driving];
      hand.roll = slew(hand.roll, axis("KeyZ", "KeyX"), Ctl.wristSlewPerSecond);
      hand.wristBend = slew(hand.wristBend, axis("KeyT", "KeyY") > 0 ? 1 : 0, Ctl.wristSlewPerSecond);
    }

    slewCameraZoom(this.camera, this.zoomNotches, dt, CONFIG.camera);
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
    this.canvas.removeEventListener("lostpointercapture", this.onLostPointerCapture);
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
        // Pause, not restart. It was the restart key for as long as there was
        // nothing to pause *for* -- a bout you were watching rather than in --
        // and the moment you are driving a body, the key nearest the thumb is
        // the one you want for stopping the world. `preventDefault` because the
        // canvas can hold focus and Space would otherwise scroll the page.
        event.preventDefault();
        this.hooks.onPause();
        return;
      case "KeyR":
        // Restart, which `Space` used to be. Not gated on `active`: it is
        // meaningful behind the curtain during a fight -- "this bout again" is
        // exactly what you want after pausing a mess -- and `main.ts` refuses
        // it from the setup screen, where there is no bout to rebuild. From a
        // decided bout it is the way back to the setup screen, and it is the
        // only way: `Space` used to agree with it there and that was the bug.
        this.hooks.onReset();
        return;
      case "Slash":
        // The key list, which used to be seventeen rows on the curtain above the
        // Fight button. Ungated on `active`, like `Tab`: the whole point of a
        // controls sheet is that you reach for it in the middle of not knowing
        // what you are doing, which is as likely mid-fight as behind a curtain.
        //
        // On `code` rather than `key`, so it is the same physical key with or
        // without shift and on a layout where `?` is somewhere else. It is
        // announced as `?` because that is what is printed on it.
        event.preventDefault();
        this.hooks.onToggleHelp();
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
      case "KeyF":
        // Both hands drop whatever they were holding down. The buttons belong to
        // the cursor and the cursor has just moved, so a guard pressed on the
        // hand you are leaving would otherwise stay pressed with nothing holding
        // it -- the same lost-release failure `openHand` exists for.
        this.openHand();
        this.state.driving = otherHand(this.state.driving);
        this.hooks.onSwapHands();
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
    this.endCameraGesture();
    this.hooks.onPauseOnly();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.onBlur();
  };

  /** Drop everything the hand was holding, and forget what it had paid for. */
  private openHand(): void {
    this.spent = 0;
    // Both, not just the driven one. Which hand the mouse has can change while
    // the window is out of focus -- `F` is a key like any other -- and a guard
    // left standing on the hand you were not holding is a pose nobody pressed.
    for (const name of HANDS) {
      this.state[name].thrust = false;
      this.state[name].guard = false;
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" && !event.isPrimary) return;
    if (this.camera.pointerId === event.pointerId && this.camera.mode !== "none") {
      event.preventDefault();
      const next = dragCamera(
        this.camera,
        event.clientX - this.cameraX,
        event.clientY - this.cameraY,
        CONFIG.camera.dragSensitivity,
        CONFIG.camera.panLimit,
      );
      Object.assign(this.camera, next);
      this.cameraX = event.clientX;
      this.cameraY = event.clientY;
      return;
    }
    this.applyButtons(event);

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const hand = this.state[this.state.driving];
    hand.pointerX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    // Screen Y grows downward; the arm does not.
    hand.pointerY = clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1);
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
    if (event.button === 1) {
      this.camera.mode = event.shiftKey ? "pan" : "orbit";
      this.camera.pointerId = event.pointerId;
      this.cameraX = event.clientX;
      this.cameraY = event.clientY;
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* capture is best effort off-canvas */ }
      return;
    }

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
    this.applyButtons(event, swallowed);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.camera.pointerId === event.pointerId && event.button === 1) {
      this.endCameraGesture();
      return;
    }
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
    this.endCameraGesture();
  };

  private readonly onLostPointerCapture = (): void => this.endCameraGesture();

  private endCameraGesture(): void {
    this.camera.mode = "none";
    this.camera.pointerId = null;
  }

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
    const hand = this.state[this.state.driving];
    hand.thrust = pose.thrust;
    hand.guard = pose.guard;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    this.zoomNotches = clamp(
      this.zoomNotches + Math.sign(event.deltaY), -CAMERA_ZOOM_NOTCHES, CAMERA_ZOOM_NOTCHES,
    );
  };
}
