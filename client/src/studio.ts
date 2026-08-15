// The studio shell: one document, one module graph, three destinations.
//
// **Why one page and not three with a shared header.** Three pages with a common
// navigation bar would be cheaper and would look just as unified. It would also
// mean three module graphs, three Babylon initialisations across a session, and a
// full document teardown every time a reader goes from a fight back to the picker
// to change one dropdown. The arena is a tool for iterating on a matchup, so the
// round trip is the thing being used, and it is therefore the thing that has to be
// cheap.
//
// **Hash routes rather than the History API.** This ships to a static `dist/` and
// is served in development by Vite, and neither rewrites an unknown path to
// `index.html`. A History-API route would 404 on reload, which is the one failure
// a reader cannot work around. `tools/serve.js` is deliberately not on that list:
// it has no bundler, so it cannot serve this page's TypeScript module graph at
// all, and it answers `/` with the legacy Canvas game instead.
//
// The legacy Canvas game is deliberately *not* a route. It is four classic scripts
// sharing top-level `const`s with no bundler; it gets a link and nothing else.

declare global {
  /**
   * The two lines of `vite/client` this file uses.
   *
   * Declared here rather than pulled in wholesale because one build-mode
   * constant is the entire dependency, and `vite/client` would also bring in
   * ambient module declarations for every asset import this repository does not
   * make.
   */
  interface ImportMeta {
    readonly env: { readonly PROD: boolean };
  }
}

/** What a mounted route hands back so the shell can take it down again. */
export interface RouteHandle {
  /**
   * Release everything the route holds beyond its own subtree.
   *
   * **Idempotent, and it may be called more than once.** The shell disposes on
   * navigation and again on `pagehide`, and a navigation that interleaves with
   * an asynchronous dispose can reach the same handle twice. A route that
   * counted its disposals rather than guarding them would double-free.
   */
  dispose(): void | Promise<void>;
}

/**
 * A route module's entry point.
 *
 * `params` is the query half of the hash route, so `#/game?stress=greybox` reaches
 * `mount` with exactly what `/v2.html?stress=greybox` used to read out of
 * `location.search`. Nothing below the shell may read `location` for its own
 * parameters -- with hash routing `location.search` is empty, and a module that
 * reached for it would silently see no options at all.
 */
export type RouteMount = (container: HTMLElement, params: URLSearchParams) => Promise<RouteHandle>;

interface Route {
  readonly title: string;
  readonly template: string;
  readonly load?: () => Promise<{ mount: RouteMount }>;
}

const ROUTES = new Map<string, Route>([
  ["/", { title: "", template: "route-home" }],
  ["/game", {
    title: "New Game",
    template: "route-game",
    load: () => import("./v2.js"),
  }],
  ["/arena", {
    title: "Battle Arena",
    template: "route-arena",
    load: () => import("./arena/arena.js"),
  }],
]);

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the studio shell is missing #${id}`);
  return found as T;
}

/**
 * Split `#/arena?trace=composed` into its path and its query.
 *
 * An unknown or absent hash is the main screen rather than an error: a reader who
 * mistypes a route should land somewhere they can act from, and every destination
 * is one click away there.
 */
export function parseRoute(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const query = raw.indexOf("?");
  const path = (query === -1 ? raw : raw.slice(0, query)) || "/";
  const params = new URLSearchParams(query === -1 ? "" : raw.slice(query + 1));
  return { path: ROUTES.has(path) ? path : "/", params };
}

/**
 * Say on the main screen what a shipped build cannot do, before it is clicked.
 *
 * The arena explains itself when a recording turns out not to be there, but a
 * reader who clicked **Battle Arena** expecting a recorded fight has already
 * been surprised by then. `import.meta.env.PROD` is the honest test and not a guess:
 * the build's copy allowlist in `vite.config.ts` emits the shell, the wasm and
 * the two room assets and asserts that nothing else was copied, so a production
 * bundle provably carries no recording -- while a development tree may or may
 * not have run `npm run trace` yet, which is why nothing is claimed there.
 *
 * The sentence lives here rather than in `web/index.html` for the same reason:
 * it is true of one build mode and the template cannot know which one it is in.
 */
function noteMissingRecordings(home: HTMLElement): void {
  const enter = home.querySelector('a[href="#/arena"]');
  if (enter === null) return;
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "This build carries no recorded fights. They are a development fixture "
    + "written by npm run trace and served out of web/, so a ?trace= link has nothing to "
    + "open here and says so. The arena runs its own fight instead: pick a matchup, press "
    + "Fight, and it is recorded in the browser with no file at all.";
  enter.before(note);
}

/**
 * Retire the links to the legacy Canvas page in a build that does not carry it.
 *
 * `vite.config.ts` has one entry and `publicDir: false`, so `dist/` holds the shell,
 * the wasm, the two room assets and the checkpoint -- and no `legacy.html`. That is
 * deliberate and stated there: four classic scripts sharing top-level `const`s are not
 * a module graph and Rollup has nothing to do with them. The consequence was two links
 * on the shipped page that 404, which is worse than no link at all, because a reader
 * cannot tell a page that was never built from one that is broken.
 *
 * The anchor is **replaced rather than hidden**. A hidden link is still in the document
 * for everything that reads the document rather than looks at it, and the sentence
 * around it still promises a page that is not there. Replacing it makes both halves
 * true at once.
 */
function retireLegacyLinks(mounted: HTMLElement): void {
  mounted.querySelectorAll('a[href="/legacy.html"]').forEach((link) => {
    const instead = document.createElement("span");
    instead.className = "muted";
    instead.textContent = "it ships only with the development server";
    link.replaceWith(instead);
  });
}

async function main(): Promise<void> {
  const root = element<HTMLElement>("studio-root");
  const routeLabel = element<HTMLElement>("studio-route");
  const errorLabel = element<HTMLElement>("studio-error");

  let handle: RouteHandle | null = null;
  // Every mount is stamped, and a stale mount that finishes after the reader has
  // already navigated away disposes itself instead of attaching. Without this a
  // fast double navigation leaves the first route's worker and render loop live
  // with nothing on screen pointing at them, which is exactly the leak this shell
  // exists to make impossible.
  let generation = 0;

  async function show(hash: string): Promise<void> {
    const mine = ++generation;
    // **Only the navigation still on screen may write here.** Every failure in
    // this function is reported through this, because a stale `show` that
    // rejects after a later one has already cleared the label would leave a
    // message about a route the reader is no longer looking at.
    const report = (error: unknown): void => {
      if (mine !== generation) return;
      errorLabel.textContent = error instanceof Error ? error.message : String(error);
    };

    try {
      const { path, params } = parseRoute(hash);
      const route = ROUTES.get(path);
      if (route === undefined) throw new Error(`no route for ${path}`);

      // Cleared before the teardown rather than after it, so that a dispose
      // failure reported below survives to be read.
      errorLabel.textContent = "";
      const previous = handle;
      if (previous !== null) {
        // **Disposed before the handle is dropped, and a failure reported
        // rather than thrown.** A route whose `dispose` throws -- a lost WebGL
        // context makes a Babylon disposal throw -- would otherwise abort this
        // function before `replaceChildren`, leaving its own DOM on screen
        // under a shell that has stopped tracking it. Whatever it failed to
        // release is unreachable either way; the reader still gets the route
        // they asked for, and the error is on the bar.
        try {
          await previous.dispose();
        } catch (error) {
          report(error);
        } finally {
          handle = null;
        }
      }
      // `dispose` is typed `void | Promise<void>`, so that await is the one
      // place a `hashchange` can get in: a later route can mount fully and set
      // `handle` while this one is suspended, and resuming into
      // `replaceChildren` would wipe live DOM and overwrite the title. Both
      // routes dispose synchronously today, which means the race is held shut
      // by an accident until this counter is checked -- and the accident ends
      // the first time a route returns a promise that settles across a task.
      if (mine !== generation) return;
      root.replaceChildren();
      routeLabel.textContent = route.title;

      const template = element<HTMLTemplateElement>(route.template);
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const mounted = fragment.firstElementChild;
      if (!(mounted instanceof HTMLElement)) {
        throw new Error(`#${route.template} has no element to mount`);
      }
      // Appended before `mount` runs, so a route scoping its lookups to `mounted`
      // is querying a node that is already in the document -- which is what makes
      // `getBoundingClientRect` and `ResizeObserver` answer honestly on the first
      // frame instead of against a detached fragment with no layout.
      root.append(fragment);
      // Every route, not just the main screen: the game route carries the second of
      // the two links, and a reader reaches it without passing through the first.
      if (import.meta.env.PROD) retireLegacyLinks(mounted);
      if (route.load === undefined) {
        if (path === "/" && import.meta.env.PROD) noteMissingRecordings(mounted);
        return;
      }

      const module = await route.load();
      if (mine !== generation) return;
      const live = await module.mount(mounted, params);
      if (mine !== generation) {
        await live.dispose();
        return;
      }
      handle = live;
    } catch (error) {
      report(error);
    }
  }

  function navigate(): void {
    void show(window.location.hash);
  }

  window.addEventListener("hashchange", navigate);
  // A route's own teardown runs on `pagehide` too. `dispose` terminates a worker
  // and stops a render loop, and a browser that keeps the page in its
  // back/forward cache would otherwise resume both on restore, for a route
  // nobody is looking at.
  window.addEventListener("pagehide", () => {
    const live = handle;
    handle = null;
    // A failure has nowhere useful to go -- the document is on its way out --
    // but an unhandled rejection would still be logged against a page that is
    // gone, and against the wrong one if this page is later restored.
    void Promise.resolve(live?.dispose()).catch(() => undefined);
  });
  // **The other half of that round trip, and not optional.** A restored
  // back/forward-cached document comes back with its DOM and its JS state
  // intact and with everything the teardown released still released: a fully
  // painted game route whose status line says "Worker and renderer ready" over
  // a terminated worker, a cancelled render loop and no resize listener. No
  // `hashchange` fires, because the hash never changed, so nothing else would
  // ever notice. Remounting the current route is the only honest answer, and it
  // costs a reader who never left nothing -- `pagehide` fired only because they
  // did. This is also why the teardown above is not `{ once: true }`: a second
  // trip out of the page has to tear down the route the first trip rebuilt.
  window.addEventListener("pageshow", (event) => { if (event.persisted) navigate(); });
  navigate();
}

void main();
