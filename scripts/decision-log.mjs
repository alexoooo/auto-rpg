// The decision log on disk: the samples file every learned mind of this set is fitted from.
// Session 08 of the style set.
//
// **What a sample is.** One director ask, and what happened between it and the next: the feature
// vector as the mind read it, the option it played, a bitmask of what was open, the damage dealt
// and taken over the window, how long the window was, and whether it was the side's last. The
// recorder that makes them is `decisionRecorder` in `scripts/tournament-worker.mjs`; what this
// file owns is only the format they are kept in.
//
// **Why this is its own module.** Version 1 of the format was three arrays written by
// `scripts/train-neural.mjs`, which imports `scripts/tournament.mjs`; version 2 is written by the
// tournament itself, under `--record`, so the format had to come out from under the trainer to
// keep the imports acyclic. `train-neural.mjs` re-exports `writeSamples` and `readSamples` from
// here, so the older call sites read the same.
//
// **Version 1 is refused by name.** It carried no rewards and an eight-bit mask, and a fitted-Q
// iteration handed one would train on rewards of zero and never say so. There is no reader for
// it and no converter: the run that made one takes minutes to make again.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { FEATURE_COUNT, NEURAL_FEATURES_VERSION } from "../src/golem/neural-features.ts";
import { STYLE_FEATURE_COUNT, STYLE_FEATURES_VERSION } from "../src/golem/style-features.ts";

export const SAMPLES_VERSION = 2;

/**
 * The two feature sets a sample can be in, by name: the second executor's columns and the third's.
 * A file says which it holds and is refused if this build's module of that name has moved.
 */
export const SAMPLE_KINDS = Object.freeze({
  neural: Object.freeze({ width: FEATURE_COUNT, features: NEURAL_FEATURES_VERSION }),
  style: Object.freeze({ width: STYLE_FEATURE_COUNT, features: STYLE_FEATURES_VERSION }),
});

/**
 * The seven arrays a sample file holds, in the order they are laid down.
 *
 * The features are single precision because they are readings of a physical body, good to four
 * digits at best, and there are sixty-nine of them a decision. The three reward columns are
 * double, because they are *differences* of two vitalities a few thousandths apart and their sum
 * over a bout has to come back as the bar margin exactly: at single precision that identity holds
 * only to about a part in a hundred million, which is inside the noise of everything else here
 * and outside the tolerance the test is written at -- and a test written to the looser number
 * would no longer catch a window that was closed against the wrong step.
 */
const ARRAYS = Object.freeze([
  ["x", Float32Array], ["y", Uint8Array], ["open", Uint16Array],
  ["dealt", Float64Array], ["taken", Float64Array], ["seconds", Float64Array], ["done", Uint8Array],
]);

const bytesOf = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

/**
 * Several recorders' packs as one set of samples. Every part must be the same kind; `bouts` is
 * the run's bout count, which is not the number of parts because a bout records up to two sides
 * and a side that was never asked records none.
 */
export function mergeSamples(parts, { kind, bouts }) {
  const width = SAMPLE_KINDS[kind]?.width;
  if (width === undefined) throw new Error(`"${kind}" is not a feature set: ${Object.keys(SAMPLE_KINDS).join(", ")}`);
  let count = 0;
  for (const part of parts) count += part.y.length;
  const out = { kind, count, bouts, width };
  for (const [name, Type] of ARRAYS) {
    const array = new Type(name === "x" ? count * width : count);
    let at = 0;
    for (const part of parts) {
      array.set(part[name], name === "x" ? at * width : at);
      at += part.y.length;
    }
    out[name] = array;
  }
  return out;
}

/** The samples as one binary file: a length, a JSON header, then the seven arrays end to end. */
export function writeSamples(path, samples) {
  const kind = samples.kind ?? "neural";
  const spec = SAMPLE_KINDS[kind];
  if (spec === undefined) throw new Error(`"${kind}" is not a feature set: ${Object.keys(SAMPLE_KINDS).join(", ")}`);
  const header = Buffer.from(JSON.stringify({
    version: SAMPLES_VERSION, kind, count: samples.count, width: spec.width,
    features: spec.features, bouts: samples.bouts,
  }));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([length, header, ...ARRAYS.map(([name]) => bytesOf(samples[name]))]));
  return { bytes: 4 + header.length + ARRAYS.reduce((sum, [name]) => sum + samples[name].byteLength, 0) };
}

/** The file back, refused by version and by a feature set this build no longer computes. */
export function readSamples(path) {
  const file = readFileSync(path);
  const length = file.readUInt32LE(0);
  const header = JSON.parse(file.subarray(4, 4 + length).toString());
  const version = header.version ?? 1;
  if (version !== SAMPLES_VERSION) {
    throw new Error(`${path} is a version ${version} samples file, which carries no rewards; this build reads version ${SAMPLES_VERSION}`);
  }
  const kind = header.kind;
  const spec = SAMPLE_KINDS[kind];
  if (spec === undefined) throw new Error(`${path} holds "${kind}" samples, which this build has no feature set for`);
  if (header.width !== spec.width || header.features !== spec.features) {
    throw new Error(`${path} holds ${header.width}-wide ${kind} samples of feature version ${header.features}; this build reads ${spec.width} of version ${spec.features}`);
  }
  const out = { kind, count: header.count, bouts: header.bouts, width: header.width };
  let at = 4 + length;
  for (const [name, Type] of ARRAYS) {
    const array = new Type(name === "x" ? header.count * header.width : header.count);
    Buffer.from(array.buffer).set(file.subarray(at, at + array.byteLength));
    at += array.byteLength;
    out[name] = array;
  }
  return out;
}
