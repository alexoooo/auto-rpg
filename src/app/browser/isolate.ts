/**
 * **Cross-origin isolation where the host sets no headers** (GitHub Pages): a fight's minds run on
 * workers of their own only where the page may share memory (`pageMinds`, `src/app/browser/worker/minds.ts`),
 * which needs COOP and COEP. The dev server and the preview send them (`vite.config.ts`); elsewhere
 * `coi-sw.js` (`public/`), a service worker over the game's pages, adds them to every response, and
 * the page reloads once to be served through it. A session flag stops a loop where service workers
 * are refused; such a page runs its minds in the world's thread, the same fight.
 */
export async function isolatePage(): Promise<void> {
  if (globalThis.crossOriginIsolated || !("serviceWorker" in navigator)) return;
  let tried = false;
  try { tried = sessionStorage.getItem("coi-reloaded") === "1"; sessionStorage.setItem("coi-reloaded", "1"); } catch { /* storage refused: try once a load */ }
  if (tried) return;
  await navigator.serviceWorker.register(new URL("coi-sw.js", document.baseURI), { scope: new URL("../..", document.baseURI).pathname });
  await navigator.serviceWorker.ready;
  location.reload();
}
