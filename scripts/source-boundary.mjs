/** Source placement and dependency checks shared by the migration report and its architectural gate. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Longest source prefix wins. A file rule overrides a directory rule. */
export const PLACEMENTS = Object.freeze([
  ...["core/bodies/", "core/physics/", "core/world/", "parts/", "combat/", "control/", "skills/", "minds/", "game/", "app/"]
    .map((folder) => [`src/${folder}`, `src/${folder}`]),
  ["src/core/math/", "src/core/math/"],
  ["src/core/spec/", "src/core/bodies/spec/"],
  ["src/core/human/", "src/core/bodies/human/"],
  ["src/core/items/", "src/core/bodies/items/"],
  ["src/core/build/", "src/core/bodies/build/"],
  ["src/core/muscle/", "src/core/bodies/muscle/"],
  ["src/core/engine/", "src/core/physics/"],
  ["src/core/data/", "src/core/data/"],
  ...["bite", "club-blow", "cut", "stomp", "straight-punch", "sword-thrust"]
    .map((name) => [`src/core/data/${name}.ts`, `src/skills/strikes/${name}/data.ts`]),
  ...["edge-profiles", "sit-back", "step-up"]
    .map((name) => [`src/core/data/${name}.ts`, `src/skills/recovery/staged/${name}-data.ts`]),
  ["src/core/data/righting.ts", "src/skills/recovery/righting/data.ts"],
  ["src/core/data/walk-run.ts", "src/skills/locomotion/walk-run/data.ts"],
  ["src/core/data/strike-profiles.ts", "src/skills/strikes/profiles/data.ts"],
  ["src/core/rules/", "src/combat/"],
  ["src/core/rules/levels.ts", "src/game/levels.ts"],
  ["src/core/control/", "src/control/"],
  ["src/core/control/assist.ts", "src/core/bodies/assist.ts"],
  ["src/core/control/command-layers.ts", "src/minds/command-layers.ts"],
  ["src/core/parts/", "src/parts/"],
  ["src/core/parts/catalog.ts", "src/minds/catalog.ts"],
  ["src/core/parts/entrant.ts", "src/minds/entrant.ts"],
  ["src/core/mind/", "src/minds/"],
  ["src/core/mind/senses.ts", "src/core/bodies/senses.ts"],
  ["src/core/mind/object-senses.ts", "src/core/bodies/object-senses.ts"],
  ["src/core/mind/held.ts", "src/control/held.ts"],
  ["src/core/mind/kit.ts", "src/skills/kit.ts"],
  ["src/core/mind/held-body.ts", "src/skills/recovery/held-body.ts"],
  ["src/core/skills/", "src/skills/"],
  ["src/core/skills/kit.ts", "src/skills/assembly.ts"],
  ["src/core/recovery/", "src/skills/recovery/"],
  ["src/core/recovery/ground/", "src/skills/recovery/"],
  ["src/core/recovery/rise/", "src/skills/recovery/staged/"],
  ["src/core/navigation/", "src/skills/locomotion/navigation/"],
  ["src/core/perception/", "src/skills/perception/"],
  ["src/core/intent/", "src/skills/intent/"],
  ["src/core/option/", "src/minds/option/"],
  ["src/core/command/", "src/minds/command/"],
  ["src/core/reptile/", "src/skills/quadruped/"],
  ["src/core/reptile/spec.ts", "src/core/bodies/quadruped/spec.ts"],
  ["src/core/reptile/physique.ts", "src/core/bodies/quadruped/physique.ts"],
  ["src/core/reptile/kinds.ts", "src/app/quadruped-parts.ts"],
  ["src/core/reptile/paw-motor.ts", "src/control/quadruped/paw-motor.ts"],
  ["src/core/reptile/righting.ts", "src/skills/recovery/righting/righting.ts"],
  ["src/core/learning/", "src/core/math/learning/"],
  ["src/core/world.ts", "src/core/world/world.ts"],
  ["src/core/state.ts", "src/core/world/state.ts"],
  ["src/core/clock.ts", "src/core/world/clock.ts"],
  ["src/core/recording.ts", "src/core/world/recording.ts"],
  ["src/core/command-delay.ts", "src/core/world/command-delay.ts"],
  ["src/core/sources.ts", "src/core/bodies/sources.ts"],
  ["src/core/character-attributes.ts", "src/core/bodies/character-attributes.ts"],
  ["src/core/read-body.ts", "src/core/bodies/read-body.ts"],
  ["src/core/read-motion.ts", "src/core/bodies/read-motion.ts"],
  ["src/core/equipment.ts", "src/core/bodies/equipment.ts"],
  ["src/core/observation.ts", "src/control/observation.ts"],
  ["src/core/physical-body.ts", "src/minds/physical-body.ts"],
  ["src/core/body.ts", "src/control/body.ts"],
  ["src/core/touches.ts", "src/combat/touches.ts"],
  ["src/core/combatant.ts", "src/game/combatant.ts"],
  ["src/core/models.ts", "src/core/bodies/models.ts"],
  ["src/core/toolkit.ts", "src/app/toolkit.ts"],
  ["src/entrants/", "src/entrants/"],
  ["src/entrants/index.ts", "src/app/entrants.ts"],
  ["src/entrants/game.ts", "src/app/catalog.ts"],
  ["src/evaluation/", "src/evaluation/"],
  ["src/apart/", "src/app/apart/"],
  ["src/node/", "src/app/node/"],
  ["src/worker/", "src/app/worker/"],
  ["src/worker/client.ts", "src/app/browser/worker/client.ts"],
  ["src/worker/minds.ts", "src/app/browser/worker/minds.ts"],
  ["src/worker/mind.worker.ts", "src/app/browser/worker/mind.worker.ts"],
  ["src/worker/world.worker.ts", "src/app/browser/worker/world.worker.ts"],
  ["src/worker/serve.ts", "src/app/browser/worker/serve.ts"],
  ["src/render/", "src/app/browser/render/"],
  ["src/ui/", "src/app/browser/ui/"],
  ["src/ui/mind-link.ts", "src/minds/config-link.ts"],
  ["src/ui/attribute-link.ts", "src/game/attribute-link.ts"],
  ["src/ui/part-label.ts", "src/game/part-label.ts"],
  ["src/audio/", "src/app/browser/audio/"],
  ["src/audio/body-sounds.ts", "src/game/audio/body-sounds.ts"],
  ["src/audio/cues.ts", "src/game/audio/cues.ts"],
  ["src/render/models.ts", "src/game/appearance/models.ts"],
  ["src/render/appearance.ts", "src/game/appearance/appearance.ts"],
  ["src/render/view.ts", "src/game/appearance/view.ts"],
  ["src/character-lab/catalog.ts", "src/game/appearance/characters.ts"],
  ["src/ratings/", "src/app/browser/ratings/"],
  ["src/character-lab/", "src/app/browser/character-lab/"],
  ["src/physics-bench/", "src/app/browser/physics-bench/"],
  ["src/arena/", "src/game/arena/"],
  ["src/dungeon/", "src/game/dungeon/"],
  ["src/lab/", "src/game/lab/"],
  ["src/environment/", "src/game/environment/"],
  ["src/environment/crypt-kit.ts", "src/app/browser/environment/crypt-kit.ts"],
  ["src/rng.ts", "src/core/math/rng.ts"],
  ["src/app-route.ts", "src/game/route.ts"],
  ["src/build-identity.ts", "src/app/node/build-identity.ts"],
  ...["app.ts", "app.css", "menu.css", "asset-url.ts", "dom.ts", "isolate.ts"]
    .map((name) => [`src/${name}`, `src/app/browser/${name}`]),
  ...["camera.ts", "case-link.ts", "crowd.ts", "fighter-hud.ts", "forge-assets.ts", "forge-room.ts", "forge-style.ts",
    "main.ts", "keys-input.ts", "measure.ts", "orbit.ts", "reel.ts", "room.ts", "scene.ts", "side-highlights.ts", "trial-overlay.ts", "view.ts",
    "style.css", "crowd.css", "forge-ui.css"]
    .map((name) => [`src/arena/${name}`, `src/app/browser/arena/${name}`]),
  ...["camera.ts", "crypt-weathering.ts", "fire.ts", "fog-plugin.ts", "hover.ts", "light-proxy.ts", "lighting.ts", "look-probe.ts",
    "main.ts", "masonry.ts", "reference-look.ts", "run-attributes.ts", "run-minds.ts", "run-view.ts", "scenery-visibility.ts", "stone.ts", "world.ts", "style.css"]
    .map((name) => [`src/dungeon/${name}`, `src/app/browser/dungeon/${name}`]),
  ...["camera.ts", "ground-disc.ts", "hud/", "main.ts", "mind-log.ts", "setup.ts", "sound-log.ts", "style.css",
    "attack-scenario.ts", "ground-scenario.ts", "locomotion-scenario.ts", "stance-scenario.ts", "reach-scenario.ts", "lab-scenario.ts", "history.ts"]
    .map((name) => [`src/lab/${name}`, `src/app/browser/lab/${name}`]),
]);

/** Modules that need more than a move, and the contracts their separate pieces belong to. */
export const SPLITS = Object.freeze({
  "src/core/mind/mind.ts": "OwnBody and output/read contracts to core/bodies; Mind and hosting to minds",
  "src/core/mind/senses.ts": "physical sense contracts and sampling to core/bodies; keep higher-level fight wiring in minds",
  "src/core/body.ts": "command/view contracts to control; HostedBody to minds",
  "src/core/parts/lookup.ts": "empty RoleParts to parts; each role augments it from its owner",
  "src/core/data/store.ts": "DataKey = keyof DataOf and loader registration in core; implementation loaders beside their owners",
  "src/core/mind/kit.ts": "generic skill lookup in skills; concrete lowering factory registered by staged recovery",
  "src/core/skills/config.ts": "plain role contracts in skills; concrete stock config unions in application composition",
  "src/core/recovery/ground/technique.ts": "shared recovery contract; concrete technique registry in app",
  "src/core/recovery/ground/skills.ts": "generic recovery wiring receives registered techniques",
  "src/core/recovery/ground/techniques.ts": "concrete technique registry to app; each implementation owns its recipe",
  "src/core/recovery/implementations/roll/index.ts": "own roll recipe, rather than importing staged recovery internals",
  "src/core/reptile/parts.ts": "gait role contract in locomotion; quadruped assembly in app",
  "src/core/reptile/paw-motor.ts": "paw control rules, tuning and role declaration in control/quadruped; gait implementations in skills/locomotion",
  "src/ui/mind-link.ts": "runtime-neutral config parsing in minds, receiving its catalog through an argument",
  "src/arena/matchup.ts": "shared recipe in game/arena; query and appearance setup in app/browser/arena",
  "src/dungeon/decals.ts": "placement data in game/dungeon; rendering in app/browser/dungeon",
  "src/lab/scenarios.ts": "shared scenario configurations in game/lab; query, display and page setup in app/browser/lab",
  "src/lab/lab-scenario.ts": "headless scenario contract in game/lab; rendered page contract in app/browser/lab",
  "src/lab/attack-scenario.ts": "headless attack recipe in game/lab; targets and controls in app/browser/lab",
  "src/lab/ground-scenario.ts": "headless ground recipe in game/lab; art, sound and controls in app/browser/lab",
  "src/lab/locomotion-scenario.ts": "headless locomotion recipe in game/lab; ground drawing and controls in app/browser/lab",
  "src/lab/reach-scenario.ts": "headless reach recipe in game/lab; ground drawing and controls in app/browser/lab",
  "src/lab/stance-scenario.ts": "headless stance recipe in game/lab; ground drawing, sound and controls in app/browser/lab",
  "src/lab/history.ts": "plain recording in game/lab; puppet adapter in app/browser/lab",
  "src/worker/": "neutral frame/protocol contracts in app/worker; browser transport and worker stages in app/browser/worker",
  "src/evaluation/": "evaluation orchestration receives application catalog, never imports entrants or application composition",
  "src/game/": "world builders receive catalog and factories from application composition",
  "src/build-identity.ts": "Node reads build inputs; browser receives the build identity from its injected adapter",
});

const matches = (file, at) => file === at || at.endsWith("/") && file.startsWith(at);

/** A source module's destination, or null when its ownership has not been decided. */
export function targetPath(file) {
  let found = null, length = -1;
  for (const [from, to] of PLACEMENTS) if (matches(file, from) && from.length > length) {
    found = `${to}${file.slice(from.length)}`; length = from.length;
  }
  return found;
}

/** Responsibility order; game and evaluation are peers, composed by the application. */
export const TARGET_LAYERS = Object.freeze([
  ["src/core/"], ["src/parts/"], ["src/combat/"], ["src/control/"],
  ["src/skills/"], ["src/minds/"], ["src/game/", "src/evaluation/"], ["src/entrants/"], ["src/app/"],
]);

export function targetLayer(file) {
  return TARGET_LAYERS.findIndex((folders) => folders.some((folder) => file.startsWith(folder)));
}

/** Every import, including dynamic imports and re-exports, resolved relative to its owner. */
function imports(file, source) {
  return ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(file), fileName)) : fileName);
}

/** Browser and Node-only names, outside strings and comments. These are not runtime-neutral contracts. */
function runtimeNames(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true), names = new Set(), local = new Set();
  const browser = /^(?:window|document|navigator|localStorage|sessionStorage|HTMLElement|HTML\w*Element|Document|Window|OffscreenCanvas|AudioContext|AudioBuffer|AudioNode|Worker|MessageEvent|Transferable|ImageBitmap|requestAnimationFrame|cancelAnimationFrame)$/;
  const node = /^(?:process|Buffer|__dirname|__filename)$/;
  const bindings = (at) => {
    if ((ts.isVariableDeclaration(at) || ts.isBindingElement(at) || ts.isParameter(at) || ts.isFunctionDeclaration(at) || ts.isFunctionExpression(at)
      || ts.isClassDeclaration(at) || ts.isInterfaceDeclaration(at) || ts.isTypeAliasDeclaration(at)
      || ts.isImportSpecifier(at) || ts.isImportClause(at) || ts.isNamespaceImport(at)) && at.name && ts.isIdentifier(at.name)) local.add(at.name.text);
    ts.forEachChild(at, bindings);
  };
  bindings(parsed);
  const visit = (at) => {
    if (ts.isIdentifier(at)) {
      const parent = at.parent;
      const member = ts.isPropertyAccessExpression(parent) && parent.name === at;
      const key = (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) && parent.name === at;
      if (!member && !key && !local.has(at.text)) {
        if (browser.test(at.text)) names.add(`browser name ${at.text}`);
        if (node.test(at.text)) names.add(`Node name ${at.text}`);
      }
    }
    ts.forEachChild(at, visit);
  };
  visit(parsed);
  return [...names].sort();
}

const runtime = (file) => file.split("/").includes("node") ? "node" : file.split("/").includes("browser") ? "browser" : "neutral";
const entrant = (file) => /^src\/entrants\/([^/]+)\//.exec(file)?.[1] ?? null;

/** Target crossings among source/source-text pairs. `place` projects imports during migration. */
export function sourceCrossings(files, { place = (file) => file } = {}) {
  const layers = new Set(), runtimes = new Set(), ownership = new Set(), unplaced = new Set();
  for (const [file, source] of files) {
    const from = place(file);
    if (from === null || targetLayer(from) < 0) { unplaced.add(file); continue; }
    const own = entrant(from), fromRuntime = runtime(from);
    if (fromRuntime === "neutral") for (const name of runtimeNames(file, source)) runtimes.add(`${from}: ${name}`);
    for (const target of imports(file, source)) {
      const to = target.startsWith("src/") ? place(target) : target;
      if (to === null) { unplaced.add(target); continue; }
      if (to.startsWith("src/")) {
        if (targetLayer(to) < 0) { unplaced.add(target); continue; }
        if (targetLayer(to) > targetLayer(from)) layers.add(`${from} -> ${to}`);
        if (entrant(to) !== null && entrant(to) !== own && !from.startsWith("src/app/")) ownership.add(`${from} -> ${to}`);
        if (fromRuntime === "neutral" && runtime(to) !== "neutral" || fromRuntime === "node" && runtime(to) === "browser" || fromRuntime === "browser" && runtime(to) === "node") {
          runtimes.add(`${from} -> ${to}`);
        }
      } else if (fromRuntime !== "node" && (to.startsWith("node:") || to.startsWith("scripts/"))
        || fromRuntime !== "browser" && (to.startsWith("@babylonjs/") || to.endsWith(".css"))) {
        runtimes.add(`${from} -> ${to}`);
      }
    }
  }
  return { unplaced: [...unplaced].sort(), layers: [...layers].sort(), runtimes: [...runtimes].sort(), ownership: [...ownership].sort() };
}

/** Read every source module; no builder list determines runtime coverage. */
export function sourceFiles(root = ROOT) {
  const out = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const file = `${folder}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".ts")) out.push([file, fs.readFileSync(path.join(root, file), "utf8")]);
    }
  };
  walk("src");
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const actual = process.argv.includes("--actual"), strict = process.argv.includes("--strict");
  const files = sourceFiles(), report = sourceCrossings(files, { place: actual ? (file) => file : targetPath });
  if (process.argv.includes("--json")) console.log(JSON.stringify({ mode: actual ? "actual" : "projected", modules: files.length, ...report }, null, 2));
  else {
    console.log(`${actual ? "Actual" : "Projected"} source boundary: ${files.length} modules`);
    for (const [kind, found] of Object.entries(report)) {
      console.log(`${kind}: ${found.length}`);
      for (const line of found) console.log(`  ${line}`);
    }
  }
  if (strict && Object.values(report).some((found) => found.length > 0)) process.exitCode = 1;
}
