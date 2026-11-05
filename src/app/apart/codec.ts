/**
 * **Plain data as text, exactly**, for what crosses between threads where no structured copy can
 * be taken at once (a browser thread reads another's answer from shared memory): JSON, but each
 * number JSON cannot write (NaN, an infinity, negative zero) and each `undefined` written as a
 * tagged object, sparse arrays by their length and present indices, and each run of numbers in shared memory (`Float64Array`) as the transport names
 * it (`Shelved`). A finite number's JSON is its shortest exact form, so it reads back to the bit.
 * A map, a set or another typed array is refused: none crosses.
 */

/** A `Float64Array` in memory both threads share, named where it lies: its offset and length, numbers. */
export interface Shelved { readonly offset: number; readonly length: number }

/** The tags: a number by its name, `undefined`, numbers in shared memory. */
type Tagged = { readonly $n: "NaN" | "Infinity" | "-Infinity" | "-0" } | { readonly $u: 1 } | { readonly $f: Shelved };

const NAMED: Readonly<Record<string, number>> = Object.freeze({ NaN: NaN, Infinity: Infinity, "-Infinity": -Infinity, "-0": -0 });
const TAGS: readonly string[] = Object.freeze(["$n", "$u", "$f", "$o", "$a"]);

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
    if (Array.isArray(one)) {
      for (let i = 0; i < one.length; i++) if (!Object.hasOwn(one, i)) return { $a: {
        length: one.length, entries: Object.getOwnPropertyNames(one).filter(key => Number.isInteger(Number(key)) && String(Number(key)) === key && Number(key) >= 0 && Number(key) < one.length)
          .map(key => [Number(key), tag(one[Number(key)])]),
      } };
      return one.map(tag);
    }
    if (typeof one === "object" && one !== null) {
      const keys = Object.keys(one), out: Record<string, unknown> = {};
      if (keys.length === 1 && TAGS.includes(keys[0]!)) return { $o: keys.map((key) => [key, tag((one as Record<string, unknown>)[key])]) };
      for (const key of keys) Object.defineProperty(out, key, { value: tag((one as Record<string, unknown>)[key]), enumerable: true, configurable: true, writable: true });
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
      if (keys[0] === "$a") {
        const sparse = record.$a as { readonly length: number; readonly entries: readonly (readonly [number, unknown])[] };
        const array = new Array<unknown>(sparse.length);
        for (const [index, item] of sparse.entries) array[index] = untag(item);
        return array;
      }
    }
    const out: Record<string, unknown> = {};
    const entries = keys.length === 1 && keys[0] === "$o" ? record.$o as [string, unknown][] : Object.entries(record);
    for (const [key, item] of entries) Object.defineProperty(out, key, { value: untag(item), enumerable: true, configurable: true, writable: true });
    return out;
  };
  return untag(JSON.parse(text));
}
