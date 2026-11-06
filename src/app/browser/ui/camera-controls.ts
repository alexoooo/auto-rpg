/** Pointer orbit and zoom shared by screens whose left button gives orders. */
export function cameraControls(canvas: HTMLCanvasElement, options: {
  readonly signal: AbortSignal;
  readonly enabled: () => boolean;
  readonly camera: { orbit(dx: number, dy: number): void; zoom(delta: number): void };
}) {
  const { signal } = options, state = { pointer: null as number | null };
  const release = () => {
    const id = state.pointer; state.pointer = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  canvas.addEventListener("contextmenu", event => event.preventDefault(), { signal });
  canvas.addEventListener("pointerdown", event => {
    if (!(event.buttons & 6) || !options.enabled()) return;
    canvas.focus(); state.pointer = event.pointerId; canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointermove", event => {
    if (options.enabled() && event.buttons & 6) options.camera.orbit(event.movementX, event.movementY);
    else release();
  }, { signal });
  canvas.addEventListener("pointerup", event => { if (!(event.buttons & 6)) release(); }, { signal });
  canvas.addEventListener("pointercancel", release, { signal });
  canvas.addEventListener("lostpointercapture", release, { signal });
  canvas.addEventListener("wheel", event => {
    event.preventDefault(); if (options.enabled()) options.camera.zoom(event.deltaY);
  }, { passive: false, signal });
  window.addEventListener("blur", release, { signal });
  signal.addEventListener("abort", release, { once: true });
}
