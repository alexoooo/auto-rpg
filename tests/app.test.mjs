import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MENU_HREF, playHref, routeFor } from "../src/app-route.ts";
import { MATCHUP_PARAM } from "../src/arena/matchup.ts";

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
  assert.match(menu, /id="menu-new-game"/); assert.match(menu, /id="menu-arena"/); assert.match(menu, /id="menu-lab"/);
  assert.match(arena, /<canvas id="stage">/); assert.match(dungeon, /<canvas id="dungeon"/);
  assert.match(lab, /<canvas id="stage"/);
  assert.ok(ids(labMenu).includes("lab-scenarios"), "the lab's menu has #lab-scenarios");
  for (const [name, text] of [["menu", menu], ["arena", arena], ["dungeon", dungeon], ["lab menu", labMenu], ["lab", lab]]) {
    const seen = ids(text);
    assert.equal(new Set(seen).size, seen.length, `no id repeats within the ${name} screen`);
  }
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
    assert.match(source, new RegExp(`export (?:async )?function ${name}\\(\\): Promise<void>`));
  }
  // The lab's shell does all its work in `bootLab`: nothing at column 0 but imports, declarations
  // and the function itself.
  const lab = await read("../src/core-lab/main.ts");
  assert.doesNotMatch(lab, selfBoot, "the lab boots on import");
  assert.match(lab, /^export async function bootLab\(address: [^)]*\): Promise<void> \{$/m);
  const topLevel = /^(?!import |export |const |type |interface |\/\/|\/\*\*| \*|\}|$)\S/m;
  assert.doesNotMatch(lab, topLevel, "src/core-lab/main.ts runs a statement on import");
  assert.match("engine.runRenderLoop(() => {});", topLevel, "the control: a bare statement at column 0 is found");
  assert.match("void boot();", selfBoot, "the control: the pattern finds a self-boot when there is one");
});

test("the_app_mounts_the_templates_index_html_holds_and_the_buttons_go_where_they_say", async () => {
  const [html, app] = await Promise.all([read("../index.html"), read("../src/app.ts")]);
  for (const id of ["menu-screen", "arena-screen", "dungeon-screen", "lab-select-screen", "lab-screen"]) {
    assert.match(app, new RegExp(`mount\\("${id}"\\)`), `app.ts mounts #${id}`);
    assert.match(html, new RegExp(`<template id="${id}">`));
  }
  assert.match(app, /need\("menu-new-game"\)\.addEventListener\("click", go\("dungeon"\)\)/);
  assert.match(app, /need\("menu-arena"\)\.addEventListener\("click", go\("arena"\)\)/);
  assert.match(app, /need\("menu-lab"\)\.addEventListener\("click", go\("lab"\)\)/);
  assert.match(app, /window\.location\.assign\(playHref\(to, window\.location\.search\)\)/, "the menu keeps the address's dials");
  // Each screen: its sheets, then its markup, then its module. The arena's sheets in cascade order and
  // one after the other; the dungeon's module finds its elements as it is evaluated.
  const order = (...marks) => marks.map((mark) => {
    const at = app.indexOf(mark);
    assert.ok(at >= 0, `app.ts has ${mark}`);
    return at;
  }).every((at, i, all) => i === 0 || at > all[i - 1]);
  assert.ok(order('await import("./style.css");', 'await import("./forge-ui.css");', 'mount("arena-screen");', 'await import("./arena/main.ts");'),
    "arena: style.css, forge-ui.css, mount, module");
  assert.ok(order('await import("./dungeon/style.css");', 'mount("dungeon-screen");', 'await import("./dungeon/main.ts");'),
    "dungeon: stylesheet, mount, module");
  assert.ok(order('await import("./core-lab/style.css");', 'mount("lab-select-screen");', 'await import("./core-lab/setup.ts");',
    'mount("lab-screen");', 'await import("./core-lab/main.ts");'), "lab: stylesheet, then the menu's markup and module, or the scenario's");
});

test("every_screen_leads_back_to_the_menu", async () => {
  const [html, main] = await Promise.all([read("../index.html"), read("../src/arena/main.ts")]);
  const arena = template(html, "arena-screen"), dungeon = template(html, "dungeon-screen");
  assert.match(arena, /id="to-menu"/);
  assert.match(main, /need<HTMLButtonElement>\("to-menu"\)\.addEventListener\("click", \(\) => window\.location\.assign\(MENU_HREF\)\)/);
  assert.match(arena, /<a href="\.\/">&larr; Main menu<\/a>/);
  assert.ok((dungeon.match(/href="\.\/"/g) ?? []).length >= 3, "brand, pause and start panel");
  assert.doesNotMatch(html, /href="\.\/(index|dungeon)\.html"/, "the screens link to the menu, not to another page");
  assert.match(template(html, "lab-select-screen"), /<a href="\.\/">&larr; Main menu<\/a>/);
  assert.match(template(html, "lab-screen"), /<a id="to-scenarios" href="\?play=lab">/);
});
