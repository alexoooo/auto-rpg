/** The persistent shell mounts one screen and owns each navigation's lifetime. */
import "./app.css";
import "./menu.css";
import "./ui/mind.css";
import "./ui/attributes.css";
import { MENU_HREF, playHref, routeFor, type Route } from "./app-route.ts";
import { need } from "./dom.ts";
import { paintLoading, screenLifetime, type NavigationOptions, type ScreenContext } from "./ui/screen.ts";

const outlet = need("app-root"), overlay = need("app-loading"), label = need("loading-label");
overlay.removeAttribute("style");
const errorNote = need("loading-error"), retry = need<HTMLButtonElement>("loading-retry");
const state = { current: null as { lifetime: ReturnType<typeof screenLifetime>; context: ScreenContext } | null,
  drafts: new Map<Route, string>(), pending: new Set<symbol>() };
const modules = {
  arena: () => import("./arena/main.ts"), dungeon: () => import("./dungeon/main.ts"), lab: () => import("./lab/setup.ts"),
};

function mount(templateId: string, root: HTMLElement): void {
  const template = document.getElementById(templateId);
  if (!(template instanceof HTMLTemplateElement)) throw new Error(`missing template #${templateId}`);
  root.replaceChildren(template.content.cloneNode(true));
}

async function open(route: Route, context: ScreenContext): Promise<void> {
  const root = context.root;
  const check = () => context.signal.throwIfAborted();
  switch (route) {
    case "menu": {
      document.title = "Auto-RPG"; mount("menu-screen", root);
      for (const to of ["dungeon", "arena", "lab"] as const) {
        const button = need(`menu-${to}`, root);
        button.addEventListener("click", () => context.navigate(state.drafts.get(to) ?? playHref(to, context.address.search), { setup: true }));
        for (const event of ["pointerenter", "focus"])
          button.addEventListener(event, () => { void modules[to]().catch(() => {}); }, { once: true });
      }
      return;
    }
    case "arena": {
      document.title = "Arena · Auto-RPG";
      await import("./arena/style.css"); check();
      await import("./arena/forge-ui.css"); check();
      mount("arena-screen", root);
      const { bootArena } = await modules.arena(); check();
      return bootArena(context);
    }
    case "dungeon": {
      document.title = "The Depths · Auto-RPG";
      await import("./dungeon/style.css"); check(); mount("dungeon-screen", root);
      const { bootDungeon } = await modules.dungeon(); check();
      return bootDungeon(context);
    }
    case "lab": {
      document.title = "Lab · Auto-RPG";
      await import("./lab/style.css"); check();
      const { labAddress } = await import("./lab/scenarios.ts"); check();
      const address = labAddress(context.address.search);
      if (address.scenario === null) {
        mount("lab-select-screen", root);
        const { showScenarios } = await modules.lab(); check();
        return showScenarios(address, context);
      }
      mount("lab-screen", root);
      const { bootLab } = await import("./lab/main.ts"); check();
      return bootLab({ ...address, scenario: address.scenario }, context);
    }
    default: { const unknown: never = route; throw new Error(`no screen for ${String(unknown)}`); }
  }
}

function navigate(href: string, options: NavigationOptions = {}): void {
  const address = new URL(href, location.href), route = routeFor(address.search);
  state.current?.lifetime.dispose(); state.pending.clear();
  if (address.href !== location.href) {
    if (options.replace) history.replaceState(null, "", address);
    else history.pushState(null, "", address);
  }
  const lifetime = screenLifetime();
  const root = document.createElement("div"); root.id = "screen-root"; root.dataset.screen = route;
  outlet.replaceChildren(root);
  errorNote.hidden = true; retry.hidden = true;
  const context: ScreenContext = {
    root, address, signal: lifetime.signal, autostart: !options.setup,
    get busy() { return state.pending.size > 0; }, own: lifetime.own, navigate,
    replace(href) {
      lifetime.signal.throwIfAborted(); address.href = new URL(href, address).href;
      history.replaceState(null, "", address);
    },
    remember(href) { state.drafts.set(route, href); },
    async loading(title, task) {
      lifetime.signal.throwIfAborted();
      const token = Symbol(); state.pending.add(token);
      overlay.hidden = false; root.inert = true; root.setAttribute("aria-busy", "true");
      const stage = async (text: string) => {
        lifetime.signal.throwIfAborted(); label.textContent = text; await paintLoading(lifetime.signal);
      };
      try { await stage(title); return await task(stage); }
      finally {
        state.pending.delete(token);
        if (!lifetime.signal.aborted && state.pending.size === 0) {
          overlay.hidden = true; root.inert = false; root.removeAttribute("aria-busy");
        }
      }
    },
  };
  state.current = { lifetime, context };
  void context.loading(route === "menu" ? "Opening the main menu" : `Preparing ${route === "dungeon" ? "the depths" : route}`, async () => open(route, context))
    .then(() => {
      if (!lifetime.signal.aborted) root.querySelector<HTMLElement>("button:not(:disabled), a[href], canvas")?.focus();
    }).catch((error: unknown) => {
      if (lifetime.signal.aborted) return;
      console.error(error); lifetime.dispose(); overlay.hidden = false; root.inert = true;
      label.textContent = "Unable to open the game";
      errorNote.hidden = false; errorNote.textContent = error instanceof Error ? error.message : String(error);
      retry.hidden = false; retry.focus();
    });
}

retry.addEventListener("click", () => navigate(location.href, { replace: true, setup: true }));
need("loading-menu").addEventListener("click", () => navigate(MENU_HREF));
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.target || link.hasAttribute("download")) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || (url.search === location.search && url.hash)) return;
  event.preventDefault(); navigate(url.href, { setup: true });
});
window.addEventListener("popstate", () => navigate(location.href, { replace: true, setup: true }));
window.addEventListener("pagehide", () => state.current?.lifetime.dispose());
window.addEventListener("pageshow", event => { if (event.persisted) navigate(location.href, { replace: true, setup: true }); });
import.meta.hot?.dispose(() => state.current?.lifetime.dispose());
navigate(location.href, { replace: true });
