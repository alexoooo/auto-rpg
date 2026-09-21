/** Public assets live beneath Vite's deployment base; Node harnesses use the root. */
export function publicAssetUrl(path: string, base = import.meta.env?.BASE_URL ?? "/"): string {
  return base + path.replace(/^\//, "");
}
