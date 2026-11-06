/**
 * **A reply box**: texts one thread writes and another reads, in order, in memory both share. A
 * browser thread cannot take a message while it waits, so a minds' thread's answers cross here
 * (`src/app/browser/worker/minds.ts`). Its two counters are the bytes written and read since it was made, and a
 * text is its length (4 bytes) and its UTF-8 bytes, written round the ring. A writer with no room
 * waits for the reader.
 */
export interface ReplyBox {
  /** The memory both threads share: the counters, then the ring. */
  readonly buffer: SharedArrayBuffer;
  /** Write `text` after every text written before it. */
  put(text: string): void;
  /** The next text not yet read; null where none is written. */
  take(): string | null;
}

/** Where the counters are: the bytes written, the bytes read. */
const WRITTEN = 0, READ = 1, HEADER = 16;

/** A box over `buffer`, or over a new ring of `bytes`. */
export function replyBox(from: SharedArrayBuffer | number): ReplyBox {
  const buffer = typeof from === "number" ? new SharedArrayBuffer(HEADER + from) : from;
  const counters = new BigInt64Array(buffer, 0, 2), ring = new Uint8Array(buffer, HEADER), size = ring.length;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const copyIn = (bytes: Uint8Array, at: number) => {
    const start = at % size, first = Math.min(bytes.length, size - start);
    ring.set(bytes.subarray(0, first), start);
    if (first < bytes.length) ring.set(bytes.subarray(first), 0);
  };
  const copyOut = (at: number, length: number): Uint8Array => {
    const out = new Uint8Array(length), start = at % size, first = Math.min(length, size - start);
    out.set(ring.subarray(start, start + first));
    if (first < length) out.set(ring.subarray(0, length - first), first);
    return out;
  };
  return {
    buffer,
    put(text) {
      const body = encoder.encode(text), need = 4 + body.length;
      if (need > size) throw new Error(`a reply of ${body.length} bytes is larger than its box of ${size}`);
      const written = Atomics.load(counters, WRITTEN);
      for (let read = Atomics.load(counters, READ); Number(written - read) + need > size; read = Atomics.load(counters, READ)) Atomics.wait(counters, READ, read);
      const length = new Uint8Array(4);
      new DataView(length.buffer).setUint32(0, body.length, true);
      const offset = Number(written % BigInt(size));
      copyIn(length, offset);
      copyIn(body, offset + 4);
      Atomics.store(counters, WRITTEN, written + BigInt(need));
    },
    take() {
      const read = Atomics.load(counters, READ);
      if (read === Atomics.load(counters, WRITTEN)) return null;
      const offset = Number(read % BigInt(size));
      const length = new DataView(copyOut(offset, 4).buffer).getUint32(0, true);
      const text = decoder.decode(copyOut(offset + 4, length));
      Atomics.store(counters, READ, read + BigInt(4 + length));
      Atomics.notify(counters, READ);
      return text;
    },
  };
}
