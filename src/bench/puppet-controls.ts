import { CONFIG } from "../config.ts";
import { turnHand } from "../golem/humanoid/orientation.ts";
import { otherHand, type HandName, type Intent } from "../mind.ts";
import { applyButtonPose, maskOfButton, nextSpent, poseFromButtons, releaseButtons } from "./buttons.ts";
import { HAND_REACH } from "../hands.ts";
import { CAMERA_ZOOM_NOTCHES, dragCamera, slewCameraZoom, type CameraGestureState } from "../camera.ts";

/**
 * The module bench's puppet: the mouse on one effector, the buttons on its thrust and guard, the
 * arrow keys on the trunk.
 *
 * **This is the arena's old controller, moved here when the arena stopped having one** (skill
 * ceiling session 06, the orders half). In a fight a person now commands -- picks whom to attack
 * and where to go -- and the mind drives the body; `src/input.ts` produces those orders. The bench
 * is different in kind: one module on a stand, no mind, no opponent, and a person tuning a chain by
 * hand. What it needs is exactly a puppet, so the puppet lives with the bench and nowhere else.
 *
 * The cursor is absolute: where it sits in the window is where the hand is asked to be, and the
 * middle of the window is centre guard. Everything listens to **pointer** events and reads the
 * buttons as levels from `event.buttons`, for the reasons the traps in `AGENTS.md` give: Babylon
 * cancels `pointerdown`, which silences every compatibility mouse event for the gesture, and a
 * level maintained from edges is wrong for ever after the first release the browser does not
 * deliver.
 */

/** What the person drives besides the acting hand. Both default off; the bench turns both on. */
export interface PuppetOwnership {
  posture: boolean;
  drivenWrist: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;



export interface PuppetHooks {
  /** `R`: build the stand again from nothing. */
  onReset: () => void;
  onToggleReadout: () => void;
  /**
   * `Space` and `Esc`: stop the world, or start it again.
   *
   * One hook for both directions rather than a pause and a resume, because the
   * key is a toggle and the thing it toggles -- the in-arena pause mode and the
   * controller together -- is one state. `main.ts` decides which way it is going, through
   * `pauseAction` in `bout.ts`, which is where the rule lives and is tested.
   */
  onPause: () => void;
  /** Blur/hidden are pause-only edges: receiving both must never resume. */
  onPauseOnly: () => void;
  /** `?`: the controls sheet, over whatever is already on screen. */
  onToggleHelp: () => void;
  /**
   * `G`: the effector overlay -- what the solver is holding, drawn over the body.
   *
   * The arena has nothing to draw here since the humanoid rig went, so `main.ts` binds it
   * to nothing. The bench does: `src/bench/overlay.ts` is the envelope view a golem arm is
   * tuned against, and it is the reason this hook is still in the surface.
   */
  onToggleRig: () => void;
  /** Overhead or Fixed: whether the camera's bearing belongs to the fighter or to
   *  the world. */
  onToggleCamera: () => void;
  /** Swing the Fixed camera's bearing one step, -1 or +1. */
  onRotateCamera: (direction: number) => void;
  /** `F`: the mouse changes hands. */
  onSwapHands: () => void;
}

export class PuppetControls {
  readonly ownership: PuppetOwnership = { posture: false, drivenWrist: false };
  readonly camera: CameraGestureState = {
    mode: "none", pointerId: null, yaw: 0, pitch: 0, panX: 0, panZ: 0, zoom: 1,
  };
  /**
   * A person's command, annotated as the `Intent` a fighter consumes -- and
   * narrowed in exactly one place: a cursor is always on a hand.
   *
   * `Intent.actingHand` is `HandName | null`, because a body whose striker is
   * its head has no hand acting. A person does: there is one mouse and it is on
   * one arm, so the host's copy of the field can never be null, and saying so
   * here is what lets `onSwapHands` call `otherHand` on it without a repair.
   * The narrowing is the whole of the host/policy difference the plan wanted a
   * second field for.
   */
  readonly state: Intent & { actingHand: HandName } = {
    forward: 0,
    strafe: 0,
    turn: 0,
    actingHand: "primary",
    // Written by `applyButtonPose` from the same press as the acting hand, and
    // cleared by `releaseButtons` beside both hands. It was initialised here and
    // never written again for the whole of the session that introduced it, which
    // is a command channel a person cannot press: a person can take either side
    // whatever the unit, so they could take a centipede, steer it, and never
    // close its jaws.
    natural: { thrust: false, guard: false },
    posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
    primary: {
      pointerX: 0, pointerY: 0,
      // What an un-pressed hand asks of a reach axis. `applyButtonPose` writes
      // this field on every button event and `releaseButtons` puts it back here,
      // so this is only where it begins -- but beginning it anywhere else would
      // extend a golem's arm for the one frame before the first pointer event.
      reach: HAND_REACH.neutral,
      roll: 0, wristBend: 0, thrust: false, guard: false,
    },
    // The hand the mouse is not on starts at rest, not out in front. It stays
    // wherever it was left the moment `F` moves the cursor off it, which is what
    // `onSwapHands` seeds -- this is only where it begins.
    secondary: {
      pointerX: CONFIG.arm.restPointerX,
      pointerY: CONFIG.arm.restPointerY,
      reach: HAND_REACH.neutral,
      roll: 0,
      wristBend: 0,
      thrust: false,
      guard: false,
    },
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly hooks: PuppetHooks;

  private readonly held = new Set<string>();
  private active = false;
  /** Arena presentation remains interactive while combat authority is paused. */
  private cameraEnabled = false;
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
  constructor(canvas: HTMLCanvasElement, hooks: PuppetHooks) {
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
    // because the middle button is the camera -- orbit, or pan with shift -- so a
    // player holds it down for whole seconds at a time. (It does not toggle the
    // lock; that is `L`. Corrected 2026-09-05.)
    window.addEventListener("auxclick", this.onAuxClick);
  }

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    this.active = true;
    this.cameraEnabled = true;
  }

  pause(): void {
    this.stop(false);
  }

  /** Freeze combat input while retaining the frozen arena's camera controls. */
  pauseCombat(): void {
    this.stop(true);
  }

  private stop(preserveCamera: boolean): void {
    this.active = false;
    this.cameraEnabled = preserveCamera;
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
      const hand = this.state[this.state.actingHand];
      turnHand(hand, axis("KeyZ", "KeyX"), axis("KeyT", "KeyY"), axis("KeyU", "KeyI"), dt);
      hand.roll = slew(hand.roll, axis("KeyZ", "KeyX"), Ctl.wristSlewPerSecond);
      hand.wristBend = slew(hand.wristBend, axis("KeyT", "KeyY") > 0 ? 1 : 0, Ctl.wristSlewPerSecond);
    }

    this.sampleCamera(dt);
    return this.state;
  }

  /** Advance only the host-owned camera easing; safe in a frozen bout. */
  sampleCamera(dt: number): CameraGestureState {
    slewCameraZoom(this.camera, this.zoomNotches, dt, CONFIG.camera);
    return this.camera;
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
    if (this.active || this.cameraEnabled) event.preventDefault();
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
        // meaningful from the pause overlay -- "this bout again" is
        // exactly what you want after pausing a mess -- and `main.ts` refuses
        // it from the setup screen, where there is no bout to rebuild. A decided
        // bout restarts too; Setup is an explicit button rather than a second
        // meaning hidden behind the same key.
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
        // Gated on `active` like the lock, and for the same reason: an overlay reads live solver
        // state. It remains a running-mode control even though the frozen arena is now visible
        // behind the compact pause overlay.
        if (this.active) this.hooks.onToggleRig();
        return;
      case "KeyV":
        if (this.cameraEnabled) this.hooks.onToggleCamera();
        return;
      case "BracketLeft":
        if (this.cameraEnabled) this.hooks.onRotateCamera(-1);
        return;
      case "BracketRight":
        // Held-down repeats never reach this switch -- `event.repeat` is answered
        // above -- so leaning on the key does not spin the arena, which is what a
        // stepped control wants and what a continuous one would not care about.
        if (this.cameraEnabled) this.hooks.onRotateCamera(1);
        return;
      case "KeyF":
        // Both hands drop whatever they were holding down. The buttons belong to
        // the cursor and the cursor has just moved, so a guard pressed on the
        // hand you are leaving would otherwise stay pressed with nothing holding
        // it -- the same lost-release failure `openHand` exists for.
        this.openHand();
        this.state.actingHand = otherHand(this.state.actingHand);
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

  /** Drop everything held, on every effector, and forget what it had paid for. */
  private openHand(): void {
    this.spent = 0;
    // Both hands and the jaws, not just the driven hand. Which hand the mouse
    // has can change while the window is out of focus -- `F` is a key like any
    // other -- and a guard left standing on an effector nobody is holding is a
    // pose nobody pressed. `releaseButtons` owns that list so this cannot fall
    // one effector behind the one that writes it again.
    releaseButtons(this.state);
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
    const hand = this.state[this.state.actingHand];
    hand.pointerX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    // Screen Y grows downward; the arm does not.
    hand.pointerY = clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    // Chrome opens its autoscroll widget on a middle press, and once it is up it
    // captures the pointer and stops delivering movement until it is dismissed.
    // Cancelling `auxclick` below is too late to stop it -- that fires after the
    // release -- so the middle press has to be cancelled here, at the edge that
    // actually opens the widget. The documented cost of cancelling `pointerdown`
    // is that the compatibility mouse events stop arriving for the rest of the
    // gesture, which is free: nothing in this file listens for them.
    if (event.button === 1 && this.cameraEnabled) {
      event.preventDefault();
      this.camera.mode = event.shiftKey ? "pan" : "orbit";
      this.camera.pointerId = event.pointerId;
      this.cameraX = event.clientX;
      this.cameraY = event.clientY;
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* capture is best effort off-canvas */ }
      return;
    }
    if (!this.active) return;

    // A press is proof that whatever the last press of this button owed has been
    // settled, however its release went missing, so it starts again unspent.
    const arriving = maskOfButton(event.button);
    this.spent &= ~arriving;
    this.applyButtons(event);
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
      // the pause overlay must not be waiting in the pose when the fight resumes.
      this.openHand();
      return;
    }
    this.spent = nextSpent(this.spent, event.buttons, swallowed);
    // The acting hand and the natural striker, from one press. Which of the two
    // the body in front of you actually reads is the body's business, and
    // nothing here switches on the unit -- see `applyButtonPose`.
    applyButtonPose(this.state, this.state.actingHand, poseFromButtons(event.buttons, this.spent));
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.cameraEnabled) return;
    event.preventDefault();
    this.zoomNotches = clamp(
      this.zoomNotches + Math.sign(event.deltaY), -CAMERA_ZOOM_NOTCHES, CAMERA_ZOOM_NOTCHES,
    );
  };
}
