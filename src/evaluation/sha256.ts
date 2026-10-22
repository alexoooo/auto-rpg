/**
 * SHA-256 (FIPS 180-4), fed in pieces: the same digest in Node, a worker and a page, from integer
 * operations alone.
 */

/** The round constants: the first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = Int32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2);

/** The initial hash: the first 32 bits of the fractional parts of the square roots of the first 8 primes. */
const H0 = Int32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);

/** 2^32, to split a length in bits into two words. */
const WORD = 0x100000000;

export class Sha256 {
  private readonly hash = Int32Array.from(H0);
  private readonly block = new Uint8Array(64);
  private readonly words = new Int32Array(64);
  /** Bytes waiting in `block`. */
  private filled = 0;
  /** Bytes taken in all. */
  private length = 0;

  /** Take `bytes` after what was taken before. */
  update(bytes: Uint8Array): this {
    const n = bytes.length;
    this.length += n;
    let i = 0;
    if (this.filled > 0) {
      while (this.filled < 64 && i < n) this.block[this.filled++] = bytes[i++];
      if (this.filled < 64) return this;
      this.compress(this.block, 0);
      this.filled = 0;
    }
    for (; i + 64 <= n; i += 64) this.compress(bytes, i);
    while (i < n) this.block[this.filled++] = bytes[i++];
    return this;
  }

  /** A hash that has taken what this one has, to go on apart from it. */
  copy(): Sha256 {
    const twin = new Sha256();
    twin.hash.set(this.hash);
    twin.block.set(this.block);
    twin.filled = this.filled;
    twin.length = this.length;
    return twin;
  }

  /** The digest of what was taken so far, 64 hex digits; this hash goes on taking. */
  hex(): string {
    const end = this.copy(), bits = this.length * 8;
    const tail = new Uint8Array((end.filled < 56 ? 64 : 128) - end.filled);
    tail[0] = 0x80;
    const high = Math.floor(bits / WORD), low = bits - high * WORD, at = tail.length - 8;
    for (let k = 0; k < 4; k++) {
      tail[at + k] = (high >>> (24 - 8 * k)) & 0xff;
      tail[at + 4 + k] = (low >>> (24 - 8 * k)) & 0xff;
    }
    end.update(tail);
    let out = "";
    for (const word of end.hash) out += (word >>> 0).toString(16).padStart(8, "0");
    return out;
  }

  /** One 64-byte block of `bytes` from `at` into the hash. */
  private compress(bytes: Uint8Array, at: number): void {
    const w = this.words, h = this.hash;
    for (let t = 0; t < 16; t++, at += 4) w[t] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
}

/** The SHA-256 of `text` as UTF-8, 64 hex digits. */
export const sha256Text = (text: string): string => new Sha256().update(new TextEncoder().encode(text)).hex();
