import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

/**
 * The runs directory, served read-only, in dev only.
 *
 * `tournaments/` is gitignored and sits outside `public/`, and both of those are deliberate: a
 * night's logs are hundreds of megabytes of raw evidence, and copying a run into `public/` so the
 * curve page could fetch it would either commit it or leave the page showing a stale copy of a
 * file that is still being written. So the runs stay where the harness put them and this plugin
 * lends the dev server a window onto them.
 *
 * **It has no `build` hook, and that is a feature the page depends on.** The built page's fetch of
 * /runs/index.json failing is how `src/curve/main.ts` finds out there is no run server behind it
 * and offers a file picker instead -- so a curve can be looked at on a machine that has never
 * trained anything. Adding a build-time copy of this listing would break that signal and bundle a
 * directory nobody meant to ship.
 *
 * Nothing here writes. Every request's resolved path is checked against the directory root before
 * anything is opened, because a dev server is still a server: `/runs/../../../etc/passwd` resolves
 * perfectly well, and the check below is the only thing between that and a file handle.
 */
function runsDirectory(): Plugin {
  const root = fileURLToPath(new URL("tournaments", import.meta.url));
  const listed = new Set([".jsonl", ".json"]);

  /**
   * Two levels: the files directly under `tournaments/` and the files inside its immediate
   * subdirectories, which is exactly the shape the harness writes -- a `train-ppo` log is a file
   * at the top and a league arm is a directory of pool-N.json beside its `league.jsonl`.
   * Recursing further would walk whatever else somebody has parked in there.
   */
  const walk = async (): Promise<{ path: string; size: number; mtime: number }[]> => {
    const files: { path: string; size: number; mtime: number }[] = [];
    const visit = async (directory: string, prefix: string, depth: number): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const here = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
          if (depth > 0) await visit(join(directory, entry.name), here, depth - 1);
          continue;
        }
        const dot = entry.name.lastIndexOf(".");
        if (dot < 0 || !listed.has(entry.name.slice(dot))) continue;
        const info = await stat(join(directory, entry.name));
        files.push({ path: here, size: info.size, mtime: info.mtimeMs });
      }
    };
    await visit(root, "", 1);
    files.sort((a, b) => b.mtime - a.mtime);
    return files;
  };

  return {
    name: "runs-directory",
    configureServer(server) {
      server.middlewares.use("/runs", (request, response, next) => {
        // Narrowed by hand rather than through `http`'s types, for the reason
        // `src/curve/node-dev.d.ts` gives: this directory has no `@types/node`, and these are the
        // only three members of a request and a response the middleware touches.
        const asked = request as unknown as { url?: string; method?: string };
        const reply = response as unknown as {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body?: string): void;
        };
        if (asked.method !== "GET") {
          next();
          return;
        }
        const rest = decodeURIComponent((asked.url ?? "/").split("?")[0] ?? "").replace(/^\/+/, "");
        if (rest === "index.json") {
          void walk().then((files) => {
            reply.setHeader("content-type", "application/json");
            reply.end(JSON.stringify({ root: "tournaments", files }));
          }).catch((error: unknown) => {
            reply.statusCode = 500;
            reply.end(String(error));
          });
          return;
        }
        // The check, and the reason this middleware is four lines longer than it looks like it
        // needs to be. `resolve` collapses every `..` the request could carry, so comparing the
        // result against the root is what decides whether a path is inside it -- and the trailing
        // separator matters, or `tournaments-private/` passes a prefix test against `tournaments`.
        const full = resolve(root, rest);
        if (full !== root && !full.startsWith(root + sep)) {
          reply.statusCode = 403;
          reply.end("outside the runs directory");
          return;
        }
        void stat(full).then((info) => {
          if (!info.isFile()) {
            reply.statusCode = 404;
            reply.end("not a file");
            return;
          }
          reply.setHeader("content-type", rest.endsWith(".json")
            ? "application/json"
            : "text/plain; charset=utf-8");
          reply.setHeader("content-length", String(info.size));
          createReadStream(full).pipe(response);
        }).catch(() => {
          reply.statusCode = 404;
          reply.end("no such run");
        });
      });
    },
  };
}

export default defineConfig({
  // strictPort matters more than it looks. Without it Vite silently moves to
  // 5181 when 5180 is taken -- usually by an earlier dev server nobody noticed
  // was still alive -- and you end up reading a stale build while editing a live
  // one. Failing loudly is the whole point.
  server: { port: 5180, strictPort: true },
  // Havok ships a .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  plugins: [runsDirectory()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4096,
    // Three entries, and all of them have to be named. Vite's default is `index.html` alone, so a
    // second page builds fine in dev -- where every request is served from source -- and is
    // simply absent from `dist`, which is the failure that looks like a routing problem and is
    // a config one. `bench.html` is the golem effector bench; `curve.html` is the learning curve.
    rollupOptions: { input: { index: "index.html", bench: "bench.html", curve: "curve.html" } },
  },
});
