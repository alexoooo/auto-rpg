/**
 * **The core's functions of a real number**: `sin`, `cos`, `tan`, `asin`, `acos`, `atan2`, `exp`,
 * `sinh`, `cosh`, `cbrt` and `hypot`.
 *
 * A JavaScript engine's own `Math.sin` and its kin are each right to about the last bit and no
 * engine is held to another's, so a bout computed with them is one bout in Node and another in a
 * browser. These are built from what IEEE 754 fixes in every engine (`+`, `-`, `*`, `/`,
 * `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.trunc`, and a double's bits read through a typed
 * array), so each returns the same double everywhere. `tests/core-boundary.test.mjs` holds the
 * core to them, and `tests/core-math.test.mjs` holds them to their recorded values.
 *
 * All but `hypot` are fdlibm's, by way of FreeBSD's msun, kept operation for operation; its notice:
 *
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
/** Which word of a double a `Uint32Array` over it reads second: its high one on a little-endian machine. */
const HI = (() => { F64[0] = 1; return U32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;

/** The high 32 bits of `x`, signed. */
const highOf = (x: number): number => { F64[0] = x; return U32[HI]! | 0; };
/** The low 32 bits of `x`, unsigned. */
const lowOf = (x: number): number => { F64[0] = x; return U32[LO]!; };
/** The double of a high and a low word. */
const fromWords = (high: number, low: number): number => { U32[HI] = high; U32[LO] = low; return F64[0]!; };
/** `x` with its low word cleared. */
const withLowZero = (x: number): number => { F64[0] = x; U32[LO] = 0; return F64[0]!; };

/** fdlibm's sentinels: a product of two overflows or underflows as IEEE says it does. */
const HUGE = 1e300, TINY = 1e-300;
/** Two to the 24th and its reciprocal, the radix of fdlibm's remainder by pi/2. */
const TWO24 = 16777216, TWON24 = 5.96046447753906250000e-08;
/** fdlibm's `scalbn`: the largest power of two, and the smallest normal one times two to the 53rd. */
const TWO1023 = 8.98846567431158e307, TWOM969 = 2.2250738585072014e-308 * 9007199254740992;

/** `x` times two to the `n`. */
function scalbn(x: number, n: number): number {
  if (n > 1023) {
    x *= TWO1023; n -= 1023;
    if (n > 1023) { x *= TWO1023; n -= 1023; if (n > 1023) n = 1023; }
  } else if (n < -1022) {
    x *= TWOM969; n += 1022 - 53;
    if (n < -1022) { x *= TWOM969; n += 1022 - 53; if (n < -1022) n = -1022; }
  }
  return x * fromWords((0x3ff + n) << 20, 0);
}

/** fdlibm's sine on [-pi/4, pi/4]: the polynomial's coefficients. */
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;

/** The sine of `x + y` on [-pi/4, pi/4], `y` the tail of `x`; `tailed` says there is one. */
function kernelSin(x: number, y: number, tailed: boolean): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return x;
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return tailed ? x - ((z * (0.5 * y - v * r) - y) - v * S1) : x + v * (S1 + z * r);
}

/** fdlibm's cosine on [-pi/4, pi/4]: the polynomial's coefficients. */
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

/** The cosine of `x + y` on [-pi/4, pi/4], `y` the tail of `x`. */
function kernelCos(x: number, y: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return 1;
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  const hz = 0.5 * z - qx, a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

/** fdlibm's tangent on [-pi/4, pi/4]: the polynomial's coefficients, and pi/4 as a head and a tail. */
const T = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
    8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
    2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
    2.59073051863633712884e-05],
  PIO4 = 7.85398163397448278999e-01, PIO4_LO = 3.06161699786838301793e-17;

/** The tangent of `x + y` on [-pi/4, pi/4] where `iy` is 1, minus its reciprocal where `iy` is -1. */
function kernelTan(x: number, y: number, iy: number): number {
  const hx = highOf(x), ix = hx & 0x7fffffff;
  if (ix < 0x3e300000 && (x | 0) === 0) {
    if (((ix | lowOf(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
    if (iy === 1) return x;
    const w = x + y, z = withLowZero(w), v = y - (z - x), a = -1 / w, t = withLowZero(a), s = 1 + t * z;
    return t + a * (s + t * v);
  }
  const near = ix >= 0x3fe59428;
  if (near) {
    if (hx < 0) { x = -x; y = -y; }
    x = (PIO4 - x) + (PIO4_LO - y);
    y = 0;
  }
  let z = x * x, w = z * z;
  let r = T[1]! + w * (T[3]! + w * (T[5]! + w * (T[7]! + w * (T[9]! + w * T[11]!))));
  let v = z * (T[2]! + w * (T[4]! + w * (T[6]! + w * (T[8]! + w * (T[10]! + w * T[12]!)))));
  let s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0]! * s;
  w = x + r;
  if (near) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2 * (x - (w * w / (w + v) - r)));
  }
  if (iy === 1) return w;
  z = withLowZero(w);
  v = r - (z - x);
  const a = -1 / w, t = withLowZero(a);
  s = 1 + t * z;
  return t + a * (s + t * v);
}

/** fdlibm's 2/pi in 24-bit pieces, for the remainder of a large argument. */
const TWO_OVER_PI = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7,
  0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C,
  0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11,
  0x8B5A0A, 0x6D1F6D, 0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7,
  0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E,
  0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B];
/** fdlibm's high words of the first 32 multiples of pi/2, where the remainder cancels worst. */
const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
  0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
  0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB];
/** fdlibm's 2/pi, and pi/2 in three pieces of 33 bits each with the tail of each. */
const INVPIO2 = 6.36619772367581382433e-01, PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11,
  PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21, PIO2_3 = 2.02226624871116645580e-21,
  PIO2_3T = 8.47842766036889956997e-32;
/** fdlibm's pi/2 in 24-bit pieces. */
const PIO2 = [1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
  1.27065575308067607349e-28, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51];

/** The terms fdlibm computes a double's remainder by pi/2 to, beyond the argument's own. */
const JK = 4;

/**
 * The remainder by pi/2 of the argument whose 24-bit pieces are `x`'s first `nx`, scaled by two to
 * the `e0`, into `y` as a head and a tail; returns the multiple's last three bits.
 */
function kernelRemPio2(x: readonly number[], y: number[], e0: number, nx: number): number {
  const jx = nx - 1, jv = Math.max(0, Math.trunc((e0 - 3) / 24));
  let q0 = e0 - 24 * (jv + 1);
  const f = new Array<number>(20).fill(0), q = new Array<number>(20).fill(0), fq = new Array<number>(20).fill(0);
  const iq = new Array<number>(20).fill(0);
  for (let i = 0, j = jv - jx; i <= jx + JK; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j]!;
  for (let i = 0; i <= JK; i++) {
    let fw = 0;
    for (let j = 0; j <= jx; j++) fw += x[j]! * f[jx + i - j]!;
    q[i] = fw;
  }
  let jz = JK, z = 0, n = 0, ih = 0;
  for (;;) {
    z = q[jz]!;
    for (let i = 0, j = jz; j > 0; i++, j--) {
      const fw = Math.trunc(TWON24 * z);
      iq[i] = Math.trunc(z - TWO24 * fw);
      z = q[j - 1]! + fw;
    }
    z = scalbn(z, q0);
    z -= 8 * Math.floor(z * 0.125);
    n = Math.trunc(z);
    z -= n;
    ih = 0;
    if (q0 > 0) {
      const i = iq[jz - 1]! >> (24 - q0);
      n += i;
      iq[jz - 1] = iq[jz - 1]! - (i << (24 - q0));
      ih = iq[jz - 1]! >> (23 - q0);
    } else if (q0 === 0) ih = iq[jz - 1]! >> 23;
    else if (z >= 0.5) ih = 2;
    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (let i = 0; i < jz; i++) {
        const j = iq[i]!;
        if (carry === 0) { if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; } }
        else iq[i] = 0xffffff - j;
      }
      if (q0 === 1) iq[jz - 1] = iq[jz - 1]! & 0x7fffff;
      else if (q0 === 2) iq[jz - 1] = iq[jz - 1]! & 0x3fffff;
      if (ih === 2) {
        z = 1 - z;
        if (carry !== 0) z -= scalbn(1, q0);
      }
    }
    if (z !== 0) break;
    let j = 0;
    for (let i = jz - 1; i >= JK; i--) j |= iq[i]!;
    if (j !== 0) break;
    // Every piece cancelled: carry the product further.
    let k = 1;
    while (iq[JK - k] === 0) k++;
    for (let i = jz + 1; i <= jz + k; i++) {
      f[jx + i] = TWO_OVER_PI[jv + i]!;
      let fw = 0;
      for (let m = 0; m <= jx; m++) fw += x[m]! * f[jx + i - m]!;
      q[i] = fw;
    }
    jz += k;
  }
  if (z === 0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) { jz--; q0 -= 24; }
  } else {
    z = scalbn(z, -q0);
    if (z >= TWO24) {
      const fw = Math.trunc(TWON24 * z);
      iq[jz] = Math.trunc(z - TWO24 * fw);
      jz += 1;
      q0 += 24;
      iq[jz] = fw;
    } else iq[jz] = Math.trunc(z);
  }
  let fw = scalbn(1, q0);
  for (let i = jz; i >= 0; i--) { q[i] = fw * iq[i]!; fw *= TWON24; }
  for (let i = jz; i >= 0; i--) {
    fw = 0;
    for (let k = 0; k <= JK && k <= jz - i; k++) fw += PIO2[k]! * q[i + k]!;
    fq[jz - i] = fw;
  }
  fw = 0;
  for (let i = jz; i >= 0; i--) fw += fq[i]!;
  y[0] = ih === 0 ? fw : -fw;
  fw = fq[0]! - fw;
  for (let i = 1; i <= jz; i++) fw += fq[i]!;
  y[1] = ih === 0 ? fw : -fw;
  return n & 7;
}

/** The remainder `remPio2` leaves, a head and a tail, and the pieces it cuts a large argument into. */
const REMAINDER = [0, 0], PIECES = [0, 0, 0];

/** `x` less the nearest multiple of pi/2, into `REMAINDER`; returns the multiple, or its last three bits. */
function remPio2(x: number): number {
  const y = REMAINDER, hx = highOf(x), ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }
  if (ix < 0x4002d97c) {
    // Within 3 pi/4: one pi/2 off, in two pieces where the first cancels.
    const sign = hx > 0 ? 1 : -1;
    let z = x - sign * PIO2_1;
    if (ix !== 0x3ff921fb) { y[0] = z - sign * PIO2_1T; y[1] = (z - y[0]) - sign * PIO2_1T; }
    else { z -= sign * PIO2_2; y[0] = z - sign * PIO2_2T; y[1] = (z - y[0]) - sign * PIO2_2T; }
    return sign;
  }
  if (ix <= 0x413921fb) {
    const t = Math.abs(x), n = Math.trunc(t * INVPIO2 + 0.5);
    let r = t - n * PIO2_1, w = n * PIO2_1T;
    y[0] = r - w;
    if (!(n < 32 && ix !== NPIO2_HW[n - 1])) {
      const j = ix >> 20;
      if (j - ((highOf(y[0]) >> 20) & 0x7ff) > 16) {
        let before = r;
        w = n * PIO2_2;
        r = before - w;
        w = n * PIO2_2T - ((before - r) - w);
        y[0] = r - w;
        if (j - ((highOf(y[0]) >> 20) & 0x7ff) > 49) {
          before = r;
          w = n * PIO2_3;
          r = before - w;
          w = n * PIO2_3T - ((before - r) - w);
          y[0] = r - w;
        }
      }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  if (ix >= 0x7ff00000) { y[0] = y[1] = x - x; return 0; }
  const e0 = (ix >> 20) - 1046;
  let z = fromWords(ix - (e0 << 20), lowOf(x));
  for (let i = 0; i < 2; i++) { PIECES[i] = Math.trunc(z); z = (z - PIECES[i]!) * TWO24; }
  PIECES[2] = z;
  let nx = 3;
  while (PIECES[nx - 1] === 0) nx--;
  const n = kernelRemPio2(PIECES, y, e0, nx);
  if (hx < 0) { y[0] = -y[0]!; y[1] = -y[1]!; return -n; }
  return n;
}

/** The sine of `x`, rad. */
export function sin(x: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, false);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x), y = REMAINDER;
  switch (n & 3) {
    case 0: return kernelSin(y[0]!, y[1]!, true);
    case 1: return kernelCos(y[0]!, y[1]!);
    case 2: return -kernelSin(y[0]!, y[1]!, true);
    default: return -kernelCos(y[0]!, y[1]!);
  }
}

/** The cosine of `x`, rad. */
export function cos(x: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x), y = REMAINDER;
  switch (n & 3) {
    case 0: return kernelCos(y[0]!, y[1]!);
    case 1: return -kernelSin(y[0]!, y[1]!, true);
    case 2: return -kernelCos(y[0]!, y[1]!);
    default: return kernelSin(y[0]!, y[1]!, true);
  }
}

/** The tangent of `x`, rad. */
export function tan(x: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelTan(x, 0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  return kernelTan(REMAINDER[0]!, REMAINDER[1]!, 1 - ((n & 1) << 1));
}

/** fdlibm's pi/2 as a head and a tail, pi/4, and pi. */
const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17, PIO4_HI = 7.85398163397448278999e-01,
  PI = 3.14159265358979311600e+00;
/** fdlibm's rational approximation of (asin(x) - x) / x^3 in x^2: its numerator's and denominator's coefficients. */
const PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01, PS2 = 2.01212532134862925881e-01,
  PS3 = -4.00555345006794114027e-02, PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05,
  QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00, QS3 = -6.88283971605453293030e-01,
  QS4 = 7.70381505559019352791e-02;
const arcNumerator = (t: number): number => t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
const arcDenominator = (t: number): number => 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));

/** The angle whose sine is `x`, rad, from -pi/2 to pi/2. */
export function asin(x: number): number {
  const hx = highOf(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | lowOf(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
    return (x - x) / (x - x);
  }
  if (ix < 0x3fe00000) {
    if (ix < 0x3e400000 && HUGE + x > 1) return x;
    const t = x * x;
    return x + x * (arcNumerator(t) / arcDenominator(t));
  }
  const t = (1 - Math.abs(x)) * 0.5, p = arcNumerator(t), q = arcDenominator(t), s = Math.sqrt(t);
  let angle: number;
  if (ix >= 0x3fef3333) angle = PIO2_HI - (2 * (s + s * (p / q)) - PIO2_LO);
  else {
    const w = withLowZero(s), c = (t - w * w) / (s + w), r = p / q;
    angle = PIO4_HI - ((2 * s * r - (PIO2_LO - 2 * c)) - (PIO4_HI - 2 * w));
  }
  return hx > 0 ? angle : -angle;
}

/** The angle whose cosine is `x`, rad, from 0 to pi. */
export function acos(x: number): number {
  const hx = highOf(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | lowOf(x)) === 0) return hx > 0 ? 0 : PI + 2 * PIO2_LO;
    return (x - x) / (x - x);
  }
  if (ix < 0x3fe00000) {
    if (ix <= 0x3c600000) return PIO2_HI + PIO2_LO;
    const z = x * x, r = arcNumerator(z) / arcDenominator(z);
    return PIO2_HI - (x - (PIO2_LO - x * r));
  }
  if (hx < 0) {
    const z = (1 + x) * 0.5, s = Math.sqrt(z), r = arcNumerator(z) / arcDenominator(z), w = r * s - PIO2_LO;
    return PI - 2 * (s + w);
  }
  const z = (1 - x) * 0.5, s = Math.sqrt(z), df = withLowZero(s), c = (z - df * df) / (s + df);
  const r = arcNumerator(z) / arcDenominator(z), w = r * s + c;
  return 2 * (df + w);
}

/** fdlibm's arctangents of 0.5, 1, 1.5 and infinity, each a head and a tail, and its polynomial's coefficients. */
const ATAN_HI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00],
  ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17],
  AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];

/** The angle whose tangent is `x`, rad, from -pi/2 to pi/2. */
function atan(x: number): number {
  const hx = highOf(x), ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lowOf(x) !== 0)) return x + x;
    return hx > 0 ? ATAN_HI[3]! + ATAN_LO[3]! : -ATAN_HI[3]! - ATAN_LO[3]!;
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000 && HUGE + x > 1) return x;
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2 * x - 1) / (2 + x); }
      else { id = 1; x = (x - 1) / (x + 1); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); }
    else { id = 3; x = -1 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0]! + w * (AT[2]! + w * (AT[4]! + w * (AT[6]! + w * (AT[8]! + w * AT[10]!)))));
  const s2 = w * (AT[1]! + w * (AT[3]! + w * (AT[5]! + w * (AT[7]! + w * AT[9]!))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATAN_HI[id]! - ((x * (s1 + s2) - ATAN_LO[id]!) - x);
  return hx < 0 ? -r : r;
}

/** fdlibm's pi/4 and pi/2, and the tail of pi. */
const PI_O_4 = 7.8539816339744827900e-01, PI_O_2 = 1.5707963267948965580e+00, PI_LO = 1.2246467991473531772e-16;

/** The angle of the point (`x`, `y`) from the x axis, rad, from -pi to pi. */
export function atan2(y: number, x: number): number {
  const hx = highOf(x), lx = lowOf(x), ix = hx & 0x7fffffff, hy = highOf(y), ly = lowOf(y), iy = hy & 0x7fffffff;
  if ((ix | ((lx | -lx) >>> 31)) > 0x7ff00000 || (iy | ((ly | -ly) >>> 31)) > 0x7ff00000) return x + y;
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y);
  // The quadrant: bit 0 the sign of y, bit 1 the sign of x.
  let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if ((iy | ly) === 0) return m < 2 ? y : m === 2 ? PI + TINY : -PI - TINY;
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) return m === 0 ? PI_O_4 + TINY : m === 1 ? -PI_O_4 - TINY : m === 2 ? 3 * PI_O_4 + TINY : -3 * PI_O_4 - TINY;
    return m === 0 ? 0 : m === 1 ? -0 : m === 2 ? PI + TINY : -PI - TINY;
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) { z = PI_O_2 + 0.5 * PI_LO; m &= 1; }
  else if (hx < 0 && k < -60) z = 0;
  else z = atan(Math.abs(y / x));
  return m === 0 ? z : m === 1 ? -z : m === 2 ? PI - (z - PI_LO) : (z - PI_LO) - PI;
}

/**
 * fdlibm's exponential: where it overflows and underflows, ln 2 as a head and a tail and its
 * reciprocal, the polynomial's coefficients, e, and two to the -1000th for a result below the
 * normal range.
 */
const O_THRESHOLD = 7.09782712893383973096e+02, U_THRESHOLD = -7.45133219101941108420e+02,
  LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00,
  P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08, E = 2.718281828459045,
  TWOM1000 = 9.33263618503218878990e-302;

/** e to the `x`. */
export function exp(x: number): number {
  let hx = highOf(x), hi = 0, lo = 0, k = 0;
  const negative = hx < 0;
  hx &= 0x7fffffff;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lowOf(x)) !== 0) return x + x;
      return negative ? 0 : x;
    }
    if (x > O_THRESHOLD) return HUGE * HUGE;
    if (x < U_THRESHOLD) return TWOM1000 * TWOM1000;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (x === 1) return E;
      hi = x - (negative ? -LN2_HI : LN2_HI);
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = Math.trunc(INVLN2 * x + (negative ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000 && HUGE + x > 1) return 1 + x;
  const t = x * x, c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - ((lo - (x * c) / (2 - c)) - hi);
  if (k >= -1021) return k === 1024 ? y * 2 * TWO1023 : y * fromWords(0x3ff00000 + (k << 20), 0);
  return y * fromWords(0x3ff00000 + ((k + 1000) << 20), 0) * TWOM1000;
}

/** fdlibm's e to the x, less one: its rational approximation's coefficients. */
const Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03, Q3 = -7.93650757867487942473e-05,
  Q4 = 4.00821782732936239552e-06, Q5 = -2.01099218183624371326e-07;

/** e to the `x`, less one, to the last bit for a small `x`. */
function expm1(x: number): number {
  let hx = highOf(x), hi: number, lo: number, c = 0, k: number;
  const negative = hx < 0;
  hx &= 0x7fffffff;
  if (hx >= 0x4043687a) {
    if (hx >= 0x40862e42) {
      if (hx >= 0x7ff00000) {
        if (((hx & 0xfffff) | lowOf(x)) !== 0) return x + x;
        return negative ? -1 : x;
      }
      if (x > O_THRESHOLD) return HUGE * HUGE;
    }
    if (negative && x + TINY < 0) return TINY - 1;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (negative) { hi = x + LN2_HI; lo = -LN2_LO; k = -1; }
      else { hi = x - LN2_HI; lo = LN2_LO; k = 1; }
    } else {
      k = Math.trunc(INVLN2 * x + (negative ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
    c = (hi - x) - lo;
  } else if (hx < 0x3c900000) {
    const t = HUGE + x;
    return x - (t - (HUGE + x));
  } else k = 0;
  const hfx = 0.5 * x, hxs = x * hfx;
  const r1 = 1 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  const t = 3 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6 - x * t));
  if (k === 0) return x - (x * e - hxs);
  const twopk = fromWords(0x3ff00000 + (k << 20), 0);
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) return x < -0.25 ? -2 * (e - (x + 0.5)) : 1 + 2 * (x - e);
  if (k <= -2 || k > 56) {
    const y = 1 - (e - x);
    return (k === 1024 ? y * 2 * TWO1023 : y * twopk) - 1;
  }
  if (k < 20) return (fromWords(0x3ff00000 - (0x200000 >> k), 0) - (e - x)) * twopk;
  return (x - (e + fromWords((0x3ff - k) << 20, 0)) + 1) * twopk;
}

/**
 * fdlibm's hyperbolic functions: the largest argument whose result is finite, two to the -28th
 * below which a sine is its argument, and the largest argument whose exponential is finite.
 */
const HYPERBOLIC_OVERFLOW = 710.4758600739439, TWO_M28 = 3.725290298461914e-9, LOG_MAX = 709.7822265625;

/** The hyperbolic sine of `x`. */
export function sinh(x: number): number {
  const h = x < 0 ? -0.5 : 0.5, ax = Math.abs(x);
  if (ax < 22) {
    if (ax < TWO_M28) return x;
    const t = expm1(ax);
    return ax < 1 ? h * (2 * t - t * t / (t + 1)) : h * (t + t / (t + 1));
  }
  if (ax < LOG_MAX) return h * exp(ax);
  if (ax <= HYPERBOLIC_OVERFLOW) {
    const w = exp(0.5 * ax);
    return (h * w) * w;
  }
  return x * Infinity;
}

/** The hyperbolic cosine of `x`. */
export function cosh(x: number): number {
  const ix = highOf(x) & 0x7fffffff, ax = Math.abs(x);
  if (ix < 0x3fd62e43) {
    const t = expm1(ax), w = 1 + t;
    return ix < 0x3c800000 ? w : 1 + (t * t) / (w + w);
  }
  if (ix < 0x40360000) {
    const t = exp(ax);
    return 0.5 * t + 0.5 / t;
  }
  if (ix < 0x40862e42) return 0.5 * exp(ax);
  if (ax <= HYPERBOLIC_OVERFLOW) {
    const w = exp(0.5 * ax);
    return (0.5 * w) * w;
  }
  return ix >= 0x7ff00000 ? x * x : HUGE * HUGE;
}

/**
 * fdlibm's cube root: the words that turn a third of an exponent into a first estimate, for a
 * normal and a subnormal argument, two to the 54th that makes a subnormal one normal, and the
 * polynomial that takes the estimate to 23 bits.
 */
const B1 = 715094163, B2 = 696219795, TWO54 = 18014398509481984,
  R0 = 1.87595182427177009643, R1 = -1.88497979543377169875, R2 = 1.621429720105354466140,
  R3 = -0.758397934778766047437, R4 = 0.145996192886612446982;

/** The cube root of `x`. */
export function cbrt(x: number): number {
  const signed = highOf(x), low = lowOf(x), sign = signed & 0x80000000, hx = signed ^ sign;
  if (hx >= 0x7ff00000) return x + x;
  let t: number;
  if (hx < 0x00100000) {
    if ((hx | low) === 0) return x;
    t = fromWords(sign | (Math.trunc((highOf(TWO54 * x) & 0x7fffffff) / 3) + B2), 0);
  } else t = fromWords(sign | (Math.trunc(hx / 3) + B1), 0);
  let r = (t * t) * (t / x);
  t = t * ((R0 + r * (R1 + r * R2)) + ((r * r) * r) * (R3 + r * R4));
  // Round the estimate away from zero to 23 bits, so that its square is exact.
  const lowT = lowOf(t), highT = highOf(t) + (lowT >= 0x80000000 ? 1 : 0);
  t = fromWords(highT, (lowT + 0x80000000) & 0xc0000000);
  // One step of Newton's iteration, to 53 bits.
  r = x / (t * t);
  r = (r - t) / ((t + t) + r);
  return t + t * r;
}

/** `x` times itself. */
export const square = (x: number): number => x * x;

/**
 * The length of the vector (`a`, `b`), or (`a`, `b`, `c`): each part over the largest, squared and
 * summed in that order, the third less what the sum of the first two lost to rounding, and the
 * root times the largest, so no part overflows on the way.
 */
export function hypot(a: number, b: number, c?: number): number {
  const x = Math.abs(a), y = Math.abs(b), z = c === undefined ? 0 : Math.abs(c), largest = Math.max(x, y, z);
  if (x === Infinity || y === Infinity || z === Infinity) return Infinity;
  if (largest !== largest) return NaN;
  if (largest === 0) return 0;
  const first = (x / largest) * (x / largest), second = (y / largest) * (y / largest), both = first + second;
  if (c === undefined) return Math.sqrt(both) * largest;
  return Math.sqrt(both + ((z / largest) * (z / largest) - ((both - first) - second))) * largest;
}

/** The length of the vector of `parts`, however many: `hypot`'s sum, each part less what the sum before it lost. */
export function norm(parts: readonly number[]): number {
  return normIn(parts, 0, parts.length);
}

/** `norm` of the `count` parts of `parts` from `from`. */
export function normIn(parts: ArrayLike<number>, from: number, count: number): number {
  let largest = 0, unknown = false;
  for (let i = from; i < from + count; i++) {
    const size = Math.abs(parts[i]!);
    if (size !== size) unknown = true;
    else if (size > largest) largest = size;
  }
  if (largest === Infinity) return Infinity;
  if (unknown) return NaN;
  if (largest === 0) return 0;
  let sum = 0, compensation = 0;
  for (let i = from; i < from + count; i++) {
    const n = Math.abs(parts[i]!) / largest, summand = n * n - compensation, next = sum + summand;
    compensation = (next - sum) - summand;
    sum = next;
  }
  return Math.sqrt(sum) * largest;
}
