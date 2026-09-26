import { CONFIG } from "./config";
import { CAMERA_ZOOM_NOTCHES, dragCamera, slewCameraZoom, type CameraGestureState } from "./camera";

/**
 * Input: a person's orders, and the camera.
 *
 * **A person commands and does not puppet** (skill ceiling session 06). The mind drives the body,
 * arms, trunk and feet; what a person hands it is an `Orders` (`src/orders.ts`): whom to fight and
 * where to go. This file reports the gestures that make one -- a click, which button, where, and
 * which steering keys are held -- and the page decides what the click landed on, because only the
 * page has a scene to pick in. The arm puppet that used to live here went to the module bench
 * (`src/bench/puppet-controls.ts`), which is the one place a person still drives a module by hand.
 *
 * Everything here listens to **pointer** events rather than mouse events, and that is not a matter
 * of taste. Babylon attaches its own input manager to the canvas and calls `preventDefault()` on
 * `pointerdown` (`preventDefaultOnPointerDown` defaults to true). Cancelling `pointerdown`
 * suppresses the compatibility mouse events for that pointer's whole gesture -- so `mousedown`,
 * `mousemove` and `mouseup` all stop firing the instant any button goes down, and a handler on them
 * is simply never called.
 *
 * An order is an **edge**: it fires once per press, on `pointerdown`, because a click that gave the
 * same order sixty times a second while a finger rested on the button would be the same order and a
 * lot of noise. What is a **level** -- which steering keys are held, whether the camera is being
 * dragged -- is dropped whole on every edge the browser may fail to deliver the end of: a blur, a
 * hidden tab, a `pointercancel` (whose `button` is -1) and a lost capture.
 */

/** Which button made an order click: the primary (left) or the secondary (right). */
export type OrderButton = "primary" | "secondary";

export interface ControlHooks {
  /** `R`: build the bout again from nothing, both fighters. */
  onReset: () => void;
  onToggleReadout: () => void;
  /**
   * `Space` and `Esc`: stop the world, or start it again.
   *
   * One hook for both directions rather than a pause and a resume, because the key is a toggle and
   * the thing it toggles -- the in-arena pause mode and the controller together -- is one state.
   * `main.ts` decides which way it is going, through `pauseAction` in `bout.ts`, which is where the
   * rule lives and is tested.
   */
  onPause: () => void;
  /** Blur/hidden are pause-only edges: receiving both must never resume. */
  onPauseOnly: () => void;
  /** `?`: the controls sheet, over whatever is already on screen. */
  onToggleHelp: () => void;
  /** Overhead or Fixed: whether the camera's bearing belongs to the fighter or to the world. */
  onToggleCamera: () => void;
  /** Swing the Fixed camera's bearing one step, -1 or +1. */
  onRotateCamera: (direction: number) => void;
  /**
   * A click on the arena, at canvas-relative CSS pixels -- the coordinates `scene.pick` takes. The
   * page picks what it landed on (a body, or the ground) and makes the order.
   */
  onOrderClick: (button: OrderButton, x: number, y: number) => void;
  /** `H`: hold the ground the body is standing on. */
  onHold: () => void;
  /** `X`: no orders -- fight the nearest enemy, as a body with none does. */
  onClearOrders: () => void;
}

/** W minus S and D minus A, each -1, 0 or 1. */
export interface SteerAxes {
  forward: number;
  strafe: number;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export class Controls {
  readonly camera: CameraGestureState = {
    mode: "none", pointerId: null, yaw: 0, pitch: 0, panX: 0, panZ: 0, zoom: 1,
  };
  /** The steering keys held now, folded by `sample`. Read-only to the page. */
  readonly steer: SteerAxes = { forward: 0, strafe: 0 };

  private readonly canvas: HTMLCanvasElement;
  private readonly hooks: ControlHooks;

  private readonly held = new Set<string>();
  private active = false;
  /** Arena presentation remains interactive while combat authority is paused. */
  private cameraEnabled = false;
  private zoomNotches = 0;
  private cameraX = 0;
  private cameraY = 0;

  // Fields and assignments rather than constructor parameter properties, as everywhere in this
  // directory: Node runs a `.ts` file by stripping its types, and strip-only mode rejects a
  // parameter property outright.
  constructor(canvas: HTMLCanvasElement, hooks: ControlHooks) {
    this.canvas = canvas;
    this.hooks = hooks;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    // A tab hidden mid-hold is a lost release under another name: no key-up or `pointerup` is ever
    // delivered for a key or button let go while the page is in the background.
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("lostpointercapture", this.onLostPointerCapture);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
    // Chrome opens its autoscroll widget on a middle click, which captures the pointer and stops
    // delivering movement until it is dismissed. The middle button is the camera -- orbit, or pan
    // with shift -- so a player holds it down for whole seconds at a time.
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

  /** Freeze orders while retaining the frozen arena's camera controls. */
  pauseCombat(): void {
    this.stop(true);
  }

  private stop(preserveCamera: boolean): void {
    this.active = false;
    this.cameraEnabled = preserveCamera;
    this.held.clear();
    this.endCameraGesture();
  }

  /**
   * Fold held keys into the steering axes, and ease the camera's zoom. Call once per rendered
   * frame. What comes back is the steering; the camera is on `this.camera`.
   */
  sample(dt: number): SteerAxes {
    const axis = (negative: string, positive: string) =>
      (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);
    this.steer.forward = axis("KeyS", "KeyW");
    this.steer.strafe = axis("KeyA", "KeyD");
    this.sampleCamera(dt);
    return this.steer;
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
    // The right button is attack-move, so it must not raise a menu mid-fight.
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
        // `preventDefault` because the canvas can hold focus and Space would otherwise scroll.
        event.preventDefault();
        this.hooks.onPause();
        return;
      case "KeyR":
        // Not gated on `active`: "this bout again" is exactly what you want after pausing a mess,
        // and `main.ts` refuses it from the setup screen, where there is no bout to rebuild.
        this.hooks.onReset();
        return;
      case "Slash":
        // On `code` rather than `key`, so it is the same physical key with or without shift; it is
        // announced as `?` because that is what is printed on it.
        event.preventDefault();
        this.hooks.onToggleHelp();
        return;
      case "KeyV":
        if (this.cameraEnabled) this.hooks.onToggleCamera();
        return;
      case "BracketLeft":
        if (this.cameraEnabled) this.hooks.onRotateCamera(-1);
        return;
      case "BracketRight":
        // Held-down repeats never reach this switch -- `event.repeat` is answered above.
        if (this.cameraEnabled) this.hooks.onRotateCamera(1);
        return;
      case "KeyH":
        // Orders are gated on `active`: pause freezes game authority, and an order given behind the
        // pause menu would be waiting in the body when the fight resumed.
        if (this.active) this.hooks.onHold();
        return;
      case "KeyX":
        if (this.active) this.hooks.onClearOrders();
        return;
      default:
        if (this.active) this.held.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** Losing focus mid-stride must not leave the fighter steering forever. */
  private readonly onBlur = (): void => {
    this.held.clear();
    this.endCameraGesture();
    this.hooks.onPauseOnly();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.onBlur();
  };

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
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    // Chrome opens its autoscroll widget on a middle press, and once it is up it captures the
    // pointer and stops delivering movement until it is dismissed. Cancelling `auxclick` is too
    // late -- that fires after the release -- so the middle press is cancelled here.
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
    // Only a press on the arena itself. `Controls` listens on the window, so a press on a DOM
    // control over the arena reaches here too; the HUD's buttons stop it themselves, and this is
    // the second line for anything that does not.
    if (event.target !== this.canvas) return;
    if (event.button !== 0 && event.button !== 2) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.hooks.onOrderClick(
      event.button === 0 ? "primary" : "secondary",
      clamp(event.clientX - rect.left, 0, rect.width),
      clamp(event.clientY - rect.top, 0, rect.height),
    );
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.camera.pointerId === event.pointerId && event.button === 1) this.endCameraGesture();
  };

  /**
   * The browser has taken the pointer away, so nothing further will be delivered for this gesture
   * -- not even the releases. `pointercancel` reports its `button` as -1.
   */
  private readonly onPointerCancel = (): void => {
    this.endCameraGesture();
  };

  private readonly onLostPointerCapture = (): void => this.endCameraGesture();

  private endCameraGesture(): void {
    this.camera.mode = "none";
    this.camera.pointerId = null;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.cameraEnabled) return;
    event.preventDefault();
    this.zoomNotches = clamp(
      this.zoomNotches + Math.sign(event.deltaY), -CAMERA_ZOOM_NOTCHES, CAMERA_ZOOM_NOTCHES,
    );
  };
}
