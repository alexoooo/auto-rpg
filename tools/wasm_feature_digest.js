// Direct feature-wasm receipt. The ordinary checker owns default goldens; this
// probe names its artifact and native receipt explicitly so a feature run can
// hide neither a stale default module nor an unrelated default-only witness.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const named = process.env.ARPG_WASM_PATH;
const nativeText = process.env.ARPG_NATIVE_STREAM_DIGEST;
if (!named || !nativeText) {
  throw new Error("ARPG_WASM_PATH and ARPG_NATIVE_STREAM_DIGEST are required");
}
const artifact = path.resolve(named);
const bytes = fs.readFileSync(artifact);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const expected = BigInt(nativeText);

function digest(wasm) {
  const lo = BigInt(wasm.articulated_stream_digest_lo() >>> 0);
  const hi = BigInt(wasm.articulated_stream_digest_hi() >>> 0);
  return (hi << 32n) | lo;
}

async function instance(at) {
  const loaded = await WebAssembly.instantiate(bytes, {});
  const wasm = loaded.instance.exports;
  const before = wasm.memory.buffer.byteLength / 65_536;
  const first = digest(wasm);
  const afterFirst = wasm.memory.buffer.byteLength / 65_536;
  const second = digest(wasm);
  const afterSecond = wasm.memory.buffer.byteLength / 65_536;
  assert.equal(first, expected, `instance ${at} first digest differs from native`);
  assert.equal(second, expected, `instance ${at} second digest differs from native`);
  assert.equal(afterSecond, afterFirst, `instance ${at} second call grew memory`);
  console.log(`instance=${at} digest=0x${first.toString(16).padStart(16, "0")} pages=${before}/${afterFirst}/${afterSecond}`);
}

console.log(`artifact=${artifact}`);
console.log(`sha256=${sha256}`);
Promise.all([instance(0), instance(1)]).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
