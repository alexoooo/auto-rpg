/**
 * **Plain data as text, exactly**, for what crosses between threads where no structured copy can
 * be taken at once (a browser thread reads another's answer from shared memory): JSON, but each
 * number JSON cannot write (NaN, an infinity, negative zero) and each `undefined` written as a
 * tagged object, and each run of numbers in shared memory (`Float64Array`) as the transport names
 * it (`Shelved`). A finite number's JSON is its shortest exact form, so it reads back to the bit.
 * A map, a set or another typed array is refused: none crosses.
 */

/** A `Float64Array` in memory both threads share, named where it lies: its offset and length, numbers. */
export interface Shelved { readonly offset: number; readonly length: number }

/** The tags: a number by its name, `undefined`, numbers in shared memory. */
type Tagged = { readonly $n: "NaN" | "Infinity" | "-Infinity" | "-0" } | { readonly $u: 1 } | { readonly $f: Shelved };

const NAMED: Readonly<Record<string, number>> = Object.freeze({ NaN: NaN, Infinity: Infinity, "-Infinity": -Infinity, "-0": -0 });

/** `value` as text, each `Float64Array` named by `shelve`. */
export function encodeExact(value: unknown, shelve: (numbers: Float64Array) => Shelved): string {
  const tag = (one: unknown): unknown => {
    if (one === undefined) return { $u: 1 } satisfies Tagged;
    if (typeof one === "number") {
      if (Number.isNaN(one)) return { $n: "NaN" } satisfies Tagged;
      if (one === Infinity) return { $n: "Infinity" } satisfies Tagged;
      if (one === -Infinity) return { $n: "-Infinity" } satisfies Tagged;
      if (Object.is(one, -0)) return { $n: "-0" } satisfies Tagged;
      return one;
    }
    if (one instanceof Float64Array) return { $f: shelve(one) } satisfies Tagged;
    if (one instanceof Map || one instanceof Set || ArrayBuffer.isView(one)) throw new Error("a map, a set or a typed array other than numbers does not cross as text");
    if (Array.isArray(one)) return one.map(tag);
    if (typeof one === "object" && one !== null) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(one)) out[key] = tag((one as Record<string, unknown>)[key]);
      return out;
    }
    return one;
  };
  return JSON.stringify(tag(value));
}

/** What `encodeExact` wrote, each run of numbers found by `unshelve`. */
export function decodeExact(text: string, unshelve: (shelved: Shelved) => Float64Array): unknown {
  const untag = (one: unknown): unknown => {
    if (Array.isArray(one)) return one.map(untag);
    if (typeof one !== "object" || one === null) return one;
    const record = one as Record<string, unknown>, keys = Object.keys(record);
    if (keys.length === 1) {
      if (keys[0] === "$n") return NAMED[record.$n as string];
      if (keys[0] === "$u") return undefined;
      if (keys[0] === "$f") return unshelve(record.$f as Shelved);
    }
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = untag(record[key]);
    return out;
  };
  return untag(JSON.parse(text));
}
