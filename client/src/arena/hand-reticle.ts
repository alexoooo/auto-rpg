/** Presentation-only marker for the stored desired hand target. */
export interface HandReticle {
  update(point: readonly [number, number] | null, captured: boolean): void;
  clear(): void;
  dispose(): void;
}

export function createHandReticle(host: HTMLElement): HandReticle {
  const marker = document.createElement("div");
  marker.className = "arena-hand-reticle";
  marker.setAttribute("aria-hidden", "true");
  host.append(marker);

  const clear = (): void => {
    marker.hidden = true;
    marker.classList.remove("captured", "offscreen");
  };
  clear();

  return Object.freeze({
    update(point: readonly [number, number] | null, captured: boolean): void {
      marker.hidden = false;
      marker.classList.toggle("captured", captured);
      if (point === null) {
        marker.classList.add("offscreen");
        marker.style.left = "50%";
        marker.style.top = "50%";
        return;
      }
      const x = Math.min(1, Math.max(0, point[0]));
      const y = Math.min(1, Math.max(0, point[1]));
      marker.classList.toggle("offscreen", x !== point[0] || y !== point[1]);
      marker.style.left = `${x * 100}%`;
      marker.style.top = `${y * 100}%`;
    },
    clear,
    dispose(): void { marker.remove(); },
  });
}
