/**
 * The load hook `research/call-count.mjs` registers: it rewrites, as each module loads, the
 * functions it counts so that each call adds one to `globalThis.__calls`, and the Rapier binding so
 * that every call into its WebAssembly does. It changes no result: a counted function returns what
 * it returned.
 */

/** Each counted function: the module it is in, how its source is rewritten, under its count's name. */
const COUNTED = [
  // A function declaration is a binding the module may assign: wrapped where it is declared.
  { file: "/src/skills/locomotion/shared/navigation/sensed-bounds.ts", name: "worldShapes", wrap: "calls" },
  { file: "/src/skills/framework/menu.ts", name: "menuOf", wrap: "calls" },
  // The selector is made once an action; its searches are the calls of what it returns.
  { file: "/src/skills/perception/openings.ts", name: "openingSelector", wrap: "searches", as: "opening searches" },
  { file: "/src/core/physics/rapier.ts", method: "contactsOf(segment, wanted) {", as: "contactsOf" },
  // A method whose signature carries types is found by its shape, typed or stripped.
  { file: "/src/skills/locomotion/shared/navigation/route-search.ts", pattern: /\broute\(goal\b[^)]*\)[^{]*\{/, as: "route searches" },
];

/** The minified binding keeps its module's exports in one variable as it finishes loading. */
const KEPT = /return ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.exports,/;

/** A module's source as text, however the loader before this one gave it. */
const textOf = (source) => typeof source === "string" ? source : new TextDecoder().decode(source);

/** `globalThis.__calls[name]` one more. */
const counting = (name) => `globalThis.__calls[${JSON.stringify(name)}] = (globalThis.__calls[${JSON.stringify(name)}] ?? 0) + 1;`;

export async function load(url, context, next) {
  const out = await next(url, context);
  if (url.includes("/@dimforge/rapier3d-simd-compat/dist/rapier.base.mjs")) {
    const text = textOf(out.source);
    if (!KEPT.test(text)) throw new Error("the Rapier binding no longer keeps its exports where the counter looks");
    return { ...out, source: text.replace(KEPT, (_, into, from) => `return ${into}=globalThis.__countWasm(${from}.exports),`) };
  }
  const counted = COUNTED.filter((one) => url.endsWith(one.file));
  if (!counted.length) return out;
  let text = textOf(out.source).split("\r\n").join("\n");
  for (const one of counted) {
    if (one.pattern) {
      if (!one.pattern.test(text)) throw new Error(`${one.file} has nothing shaped ${one.pattern}`);
      text = text.replace(one.pattern, (found) => `${found} ${counting(one.as)}`);
      continue;
    }
    if (one.method) {
      if (!text.includes(one.method)) throw new Error(`${one.file} has no ${one.method}`);
      text = text.replace(one.method, `${one.method} ${counting(one.as)}`);
      continue;
    }
    if (!text.includes(`function ${one.name}(`)) throw new Error(`${one.file} declares no ${one.name}`);
    const as = one.as ?? one.name;
    text += one.wrap === "searches"
      ? `\n${one.name} = ((made) => (...args) => { const search = made(...args); return (...a) => { ${counting(as)} return search(...a); }; })(${one.name});\n`
      : `\n${one.name} = ((counted) => (...args) => { ${counting(as)} return counted(...args); })(${one.name});\n`;
  }
  return { ...out, source: text };
}
