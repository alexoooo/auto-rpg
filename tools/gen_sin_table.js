// Regenerates crates/fx/src/sin_table.rs
//
// The table is committed as Rust source on purpose: the sim must produce
// bit-identical results on every platform, and a build-time computation would
// bake in whatever the *building* host's libm happened to return. Run with:
//
//     node tools/gen_sin_table.js
//
const fs = require("fs");
const path = require("path");

const N = 1024;
const vals = [];
for (let i = 0; i < N; i++) {
  vals.push(Math.round(65536 * Math.sin((2 * Math.PI * i) / N)));
}

let out = "";
out += "//! Generated sine table -- DO NOT EDIT BY HAND.\n";
out += "//!\n";
out += "//! `SIN_TABLE[i] = round(65536 * sin(2*pi*i/1024))`, i.e. one full turn of\n";
out += "//! [`Fx`](crate::Fx) raw values sampled at 1024 points. Committed as source\n";
out += "//! rather than computed at build time so the values can never drift with the\n";
out += "//! host libm -- that is the whole point of this crate.\n";
out += "//!\n";
out += "//! Regenerate with `tools/gen_sin_table.js` if the resolution ever changes.\n\n";
out += `pub const SIN_TABLE_LEN: usize = ${N};\n\n`;
out += "pub static SIN_TABLE: [i32; SIN_TABLE_LEN] = [\n";
for (let i = 0; i < N; i += 8) {
  out += "    " + vals.slice(i, i + 8).join(", ") + ",\n";
}
out += "];\n";

const dest = path.join(__dirname, "..", "crates", "fx", "src", "sin_table.rs");
fs.writeFileSync(dest, out);
console.log(`wrote ${vals.length} entries to ${dest}`);
