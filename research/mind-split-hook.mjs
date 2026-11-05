/** Time the in-process mirror's observers, answer and decision for `mind-split.mjs`. */
const CALLS = [
  /for \(const one of listeners\) one\(world\.steps, world\.time\);/,
  /answer\(made.mind, moves, mirror\);/,
  /think\(made.mind, mirror\);/,
];

const textOf = (source) => typeof source === "string" ? source : new TextDecoder().decode(source);

export async function load(url, context, next) {
  const out = await next(url, context);
  if (!url.endsWith("/src/core/mind/mind.ts")) return out;
  let source = textOf(out.source);
  for (const call of CALLS) {
    if (!call.test(source)) throw new Error("the mirror's phases no longer match the split timer");
    source = source.replace(call, (body) => `{ const __from = performance.now(); ${body} globalThis.__mindTime?.(built, performance.now() - __from); }`);
  }
  return { ...out, source };
}
