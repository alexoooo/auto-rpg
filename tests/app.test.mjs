import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MENU_HREF, playHref, routeFor } from "../src/app-route.ts";
import { MATCHUP_PARAM } from "../src/arena/matchup.ts";
import { screenLifetime } from "../src/ui/screen.ts";
import { SECTIONS } from "../src/lab/hud/sections.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const template = (html, id) => {
  const found = html.match(new RegExp(`<template id="${id}">([\\s\\S]*?)</template>`));
  assert.ok(found, `index.html has a #${id} template`);
  return found[1];
};
const ids = (text) => [...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

test("an_address_opens_the_menu_the_arena_the_dungeon_or_the_lab", () => {
  assert.equal(routeFor(""), "menu");
  assert.equal(routeFor("?play=arena"), "arena");
  assert.equal(routeFor("?play=dungeon"), "dungeon");
  assert.equal(routeFor("?play=lab"), "lab");
  assert.equal(routeFor("?play=elsewhere"), "menu");
  assert.equal(routeFor("?quality=reduced"), "menu", "a screen's setting alone names no screen");
  assert.equal(routeFor(`?${MATCHUP_PARAM}=workshop-rogue,crypt-skeleton`), "menu", "nor does a matchup");
  assert.equal(routeFor(`?play=dungeon&${MATCHUP_PARAM}=workshop-rogue,crypt-skeleton`), "dungeon");
  for (const to of ["arena", "dungeon", "lab"]) assert.equal(routeFor(playHref(to)), to);
  // Choosing a screen keeps the rest of the address.
  assert.equal(playHref("dungeon", "?quality=reduced"), "?quality=reduced&play=dungeon");
  assert.equal(playHref("dungeon", "?play=arena"), "?play=dungeon", "the screen is replaced, not repeated");
  assert.equal(MENU_HREF, "./");
});

test("index_html_is_one_document_holding_four_screens", async () => {
  const html = await read("../index.html");
  const entries = [...html.matchAll(/<script\b[^>]*type="module"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(entries, ['<script type="module" src="/src/app.ts">'], "one module entry, the app");
  assert.doesNotMatch(html, /<link\b[^>]*stylesheet/, "each screen's stylesheets are loaded by src/app.ts");
  const menu = template(html, "menu-screen"), arena = template(html, "arena-screen");
  const dungeon = template(html, "dungeon-screen");
  const labMenu = template(html, "lab-select-screen"), lab = template(html, "lab-screen");
  assert.match(menu, /id="menu-dungeon"/); assert.match(menu, /id="menu-arena"/); assert.match(menu, /id="menu-lab"/);
  assert.match(arena, /<canvas id="stage" tabindex="0" aria-label="Arena game">/); assert.match(dungeon, /<canvas id="dungeon"/);
  assert.match(lab, /<canvas id="stage"/);
  assert.ok(ids(labMenu).includes("lab-scenarios"), "the lab's menu has #lab-scenarios");
  for (const [name, text] of [["menu", menu], ["arena", arena], ["dungeon", dungeon], ["lab menu", labMenu], ["lab", lab]]) {
    const seen = ids(text);
    assert.equal(new Set(seen).size, seen.length, `no id repeats within the ${name} screen`);
  }
  // The lab's HUD is its sections and no other: each a `<details>` that opens with its `<summary>`.
  assert.deepEqual([...lab.matchAll(/<details class="section" data-section="([^"]+)" open>\s*<summary>/g)].map((m) => m[1]).sort(),
    [...SECTIONS].sort());
  assert.equal((lab.match(/<details\b/g) ?? []).length, SECTIONS.length, "every <details> of the lab is a section");
  // The shell finds by id only what the template holds.
  const needed = [...(await read("../src/lab/main.ts")).matchAll(/\bneed(?:<\w+>)?\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(needed.filter((id) => !ids(lab).includes(id)), [], "src/lab/main.ts needs an id the lab's template lacks");
  assert.ok(needed.includes("stage") && needed.includes("transport"), "the control: the shell's ids are found");
  // The control: the two modes may share ids only because a document never holds both.
  assert.ok(ids(arena).includes("help") && ids(dungeon).includes("help"));
});

test("no_screen_boots_itself_when_it_is_imported", async () => {
  // A statement at column 0 that calls a boot function, however spelt: `boot()`, `void boot();`,
  // `bootArena();`. Calls inside `bootArena`'s body are indented and do not match.
  const selfBoot = /^(?:void\s+|await\s+)?boot\w*\(/m;
  for (const [path, name] of [["../src/arena/main.ts", "bootArena"], ["../src/dungeon/main.ts", "bootDungeon"]]) {
    const source = await read(path);
    assert.doesNotMatch(source, selfBoot, `${path} boots on import`);
    assert.match(source, new RegExp(`export async function ${name}\\(context: ScreenContext\\): Promise<void>`));
  }
  // The lab's shell does all its work in `bootLab`: nothing at column 0 but imports, declarations
  // and the function itself.
  const lab = await read("../src/lab/main.ts");
  assert.doesNotMatch(lab, selfBoot, "the lab boots on import");
  assert.match(lab, /^export async function bootLab\(address: [^)]*\): Promise<void> \{$/m);
  const topLevel = /^(?!import |export |const |type |interface |\/\/|\/\*\*| \*|\}|$)\S/m;
  assert.doesNotMatch(lab, topLevel, "src/lab/main.ts runs a statement on import");
  assert.match("engine.runRenderLoop(() => {});", topLevel, "the control: a bare statement at column 0 is found");
  assert.match("void boot();", selfBoot, "the control: the pattern finds a self-boot when there is one");
});

test("the_shell_holds_screen_templates_and_uses_internal_navigation", async () => {
  const [html, app] = await Promise.all([read("../index.html"), read("../src/app.ts")]);
  for (const id of ["menu-screen", "arena-screen", "dungeon-screen", "lab-select-screen", "lab-screen"]) {
    assert.ok(app.includes(`mount("${id}", root)`), `app mounts #${id}`);
    assert.ok(html.includes(`<template id="${id}">`));
  }
  assert.ok(html.includes('id="app-root"'));
  assert.ok(html.includes('id="app-loading"'));
  assert.ok(app.includes('history.pushState'));
  assert.ok(app.includes('"popstate"'));
  for (const path of ["../src/app.ts", "../src/arena/main.ts", "../src/dungeon/main.ts", "../src/lab/main.ts"]) {
    assert.doesNotMatch(await read(path), /location\.(assign|reload|replace)\(/, `${path} navigates the document`);
  }
});

test("screen_resources_dispose_once_in_reverse_order_and_release_late_results", async () => {
  const lifetime = screenLifetime(), events = [];
  const target = new EventTarget();
  target.addEventListener("input", () => events.push("input"), { signal: lifetime.signal });
  lifetime.own(() => events.push("engine"));
  lifetime.own(() => events.push("world"));
  lifetime.own(() => events.push("run"));
  let complete;
  const loading = new Promise(resolve => { complete = resolve; });
  const pending = loading.then(() => lifetime.own(() => events.push("late asset")));
  lifetime.dispose(); lifetime.dispose();
  target.dispatchEvent(new Event("input"));
  complete(); await pending;
  assert.equal(lifetime.signal.aborted, true);
  assert.deepEqual(events, ["run", "world", "engine", "late asset"]);
});

test("every_screen_leads_back_to_the_menu", async () => {
  const [html, main] = await Promise.all([read("../index.html"), read("../src/arena/main.ts")]);
  const arena = template(html, "arena-screen"), dungeon = template(html, "dungeon-screen");
  assert.match(arena, /id="to-menu"/);
  assert.ok(main.includes('need<HTMLButtonElement>("to-menu").addEventListener("click", () => context.navigate(MENU_HREF))'));
  assert.match(arena, /<a href="\.\/">&larr; Main menu<\/a>/);
  assert.ok((dungeon.match(/href="\.\/"/g) ?? []).length >= 3, "brand, pause and start panel");
  assert.doesNotMatch(html, /href="\.\/(index|dungeon)\.html"/, "the screens link to the menu, not to another page");
  assert.match(template(html, "lab-select-screen"), /<a href="\.\/">&larr; Main menu<\/a>/);
  assert.match(template(html, "lab-screen"), /<a id="to-scenarios" href="\?play=lab">/);
});
