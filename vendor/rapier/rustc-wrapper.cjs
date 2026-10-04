// Cargo's local-path package identity reaches rustc's symbol hashes even with path remapping.
// Pin that build-only identity to the package, target and selected features, not its checkout.
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const [compiler, ...args] = process.argv.slice(2);
if (args.includes("--crate-name") && process.env.CARGO_PKG_NAME && process.env.CARGO_PKG_VERSION) {
  const value = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const features = args.flatMap((arg, i) => arg === "--cfg" && args[i + 1]?.startsWith("feature=") ? [args[i + 1]] : []).sort();
  const identity = JSON.stringify([process.env.CARGO_PKG_NAME, process.env.CARGO_PKG_VERSION,
    value("--crate-name"), value("--crate-type"), value("--target"), features]);
  for (let i = args.length - 1; i >= 0; i--) {
    if (args[i].startsWith("-Cmetadata=")) args.splice(i, 1);
    else if (args[i].startsWith("metadata=") && args[i - 1] === "-C") { args.splice(i - 1, 2); i--; }
  }
  args.push("-C", `metadata=${createHash("sha256").update(identity).digest("hex")}`);
}
const result = spawnSync(compiler, args, { stdio: "inherit" });
if (result.error) { console.error(result.error); process.exit(1); }
process.exit(result.status ?? 1);
