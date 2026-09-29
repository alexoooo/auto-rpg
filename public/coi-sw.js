/*
 * Cross-origin isolation for a host that sets no headers (GitHub Pages): a service worker that
 * re-serves every same-scope response with
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *   Cross-Origin-Resource-Policy: same-origin
 * so the page gets `crossOriginIsolated` and SharedArrayBuffer, which MuJoCo's threaded build
 * (Emscripten pthreads) needs. Written for the physics bake-off (research/physics-bakeoff/REPORT.md);
 * `physics-bench.html?mt=1` installs it. The first visit loads without it and reloads once.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Chrome throws on this combination; leave it to the network.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  event.respondWith(
    fetch(request).then((response) => {
      // Opaque responses cannot be rewrapped; status 0 means nothing to add headers to.
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }),
  );
});
