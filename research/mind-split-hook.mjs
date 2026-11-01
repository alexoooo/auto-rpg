/**
 * The load hook `research/mind-split.mjs` registers: it rewrites, as `src/core/mind/mind.ts` loads,
 * the call of a body's mind in its step (`embody`), and its observers of the completed physics
 * (`OwnBody.afterPhysics`), so that their wall time goes to `globalThis.__mindTime(built, ms)`:
 * what a mind thread would run. Its senses are read before the clock starts, as the world's
 * part. It changes no result: the mind steps on the senses it stepped on.
 */

/** The call `embody` makes of its mind each step, typed or stripped. */
const CALL = /mind!?\s*\.step\(sense\(\), dt\);/;

/** Its observers of the completed physics, run by one world hook. */
const OBSERVERS = /for \(const one of listeners\) one\(world\.steps, world\.time\);/;

/** A module's source as text, however the loader before this one gave it. */
const textOf = (source) => typeof source === "string" ? source : new TextDecoder().decode(source);

export async function load(url, context, next) {
  const out = await next(url, context);
  if (!url.endsWith("/src/core/mind/mind.ts")) return out;
  const text = textOf(out.source);
  if (!CALL.test(text) || !OBSERVERS.test(text)) throw new Error("embody no longer steps its mind or its observers where the split's timer looks");
  return { ...out, source: text.replace(OBSERVERS, "{ const __from = performance.now(); for (const one of listeners) one(world.steps, world.time); globalThis.__mindTime?.(built, performance.now() - __from); }").replace(CALL, "{ const __senses = sense(), __from = performance.now(); mind.step(__senses, dt); globalThis.__mindTime?.(built, performance.now() - __from); }") };
}
