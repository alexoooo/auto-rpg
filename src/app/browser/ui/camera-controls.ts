/** How much one wheel unit zooms: the distance is multiplied by e to this much, set by eye. */
const WHEEL = .001;

/**
 * **Camera gestures shared by the screens.** A mouse turns the camera with its middle or right
 * button held, and zooms with its wheel. Two fingers turn it as they move together, and zoom it as
 * they pinch. The left button or a lone finger turns it too, where that gives no order (`orders`).
 * Zoom is a factor: the camera's distance is multiplied by it.
 */
export function cameraControls(canvas: HTMLCanvasElement, options: {
  readonly signal: AbortSignal;
  readonly enabled: () => boolean;
  /** Whether the left button or a lone finger gives an order now. Left out, it never does. */
  readonly orders?: () => boolean;
  readonly camera: { orbit(dx: number, dy: number): void; zoom(factor: number): void };
}) {
  const { signal } = options, orders = () => options.orders?.() ?? false;
  /** Each pointer that is down on the canvas and may turn the camera, with where it last was. */
  const held = new Map<number, { x: number; y: number }>();
  const release = (id: number) => { if (held.delete(id) && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); };
  const releaseAll = () => { for (const id of [...held.keys()]) release(id); };
  /** Whether `event`'s pointer is down in a way that may turn the camera: any finger, or a mouse with a turning button held. */
  const down = (event: PointerEvent) => event.pointerType === "mouse" ? !!(event.buttons & (orders() ? 6 : 7)) : event.buttons !== 0;
  canvas.addEventListener("contextmenu", event => event.preventDefault(), { signal });
  canvas.addEventListener("pointerdown", event => {
    if (!down(event) || !options.enabled()) return;
    canvas.focus(); held.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointermove", event => {
    const at = held.get(event.pointerId);
    if (!at) return;
    if (!down(event) || !options.enabled()) { release(event.pointerId); return; }
    const dx = event.clientX - at.x, dy = event.clientY - at.y;
    if (held.size === 1) {
      // A lone finger that gives an order is the order's, not the camera's.
      if (event.pointerType === "mouse" || !orders()) options.camera.orbit(dx, dy);
    } else {
      // Two fingers: the pinch is how their distance changed, the turn how their middle moved.
      const other = [...held].find(([id]) => id !== event.pointerId)![1];
      const before = Math.hypot(at.x - other.x, at.y - other.y), after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (before > 0 && after > 0) options.camera.zoom(before / after);
      options.camera.orbit(dx / held.size, dy / held.size);
    }
    at.x = event.clientX; at.y = event.clientY;
  }, { signal });
  canvas.addEventListener("pointerup", event => { if (!down(event)) release(event.pointerId); }, { signal });
  canvas.addEventListener("pointercancel", event => release(event.pointerId), { signal });
  canvas.addEventListener("lostpointercapture", event => release(event.pointerId), { signal });
  canvas.addEventListener("wheel", event => {
    event.preventDefault(); if (options.enabled()) options.camera.zoom(Math.exp(event.deltaY * WHEEL));
  }, { passive: false, signal });
  window.addEventListener("blur", releaseAll, { signal });
  signal.addEventListener("abort", releaseAll, { once: true });
}
