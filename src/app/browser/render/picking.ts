/** Babylon scales picking inputs itself; convert viewport coordinates into its input space once. */
export function pickingCoordinates(clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  renderWidth: number, renderHeight: number, hardwareScaling: number): { x: number; y: number } {
  return { x: (clientX - rect.left) * renderWidth * hardwareScaling / rect.width,
    y: (clientY - rect.top) * renderHeight * hardwareScaling / rect.height };
}
