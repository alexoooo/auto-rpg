"use strict";

const fs = require("node:fs");

function uleb(bytes, state) {
  let value = 0, shift = 0;
  for (;;) {
    if (state.at >= state.end) throw new Error("truncated unsigned LEB");
    const byte = bytes[state.at++]; value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return value;
    shift += 7; if (shift > 53) throw new Error("unsigned LEB is too wide");
  }
}

function sleb(bytes, state) {
  let value = 0, shift = 0, byte;
  do {
    if (state.at >= state.end) throw new Error("truncated signed LEB");
    byte = bytes[state.at++]; value += (byte & 0x7f) * 2 ** shift; shift += 7;
    if (shift > 53) throw new Error("signed LEB is too wide");
  } while (byte & 0x80);
  if (byte & 0x40) value -= 2 ** shift;
  return value;
}

function string(bytes, state) {
  const length = uleb(bytes, state); const end = state.at + length;
  if (end > state.end) throw new Error("string overruns section");
  const value = new TextDecoder().decode(bytes.subarray(state.at, end)); state.at = end; return value;
}

function sections(bytes) {
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109)
    throw new Error("not a wasm module");
  const rows = []; const state = { at: 8, end: bytes.length };
  while (state.at < state.end) {
    const id = bytes[state.at++], size = uleb(bytes, state), start = state.at, end = start + size;
    if (end > bytes.length) throw new Error("section overruns module");
    rows.push({ id, start, end }); state.at = end;
  }
  return rows;
}

function importedFunctions(bytes, row) {
  if (!row) return 0; const s = { at: row.start, end: row.end }; let count = 0;
  for (let left = uleb(bytes, s); left; --left) {
    string(bytes, s); string(bytes, s); const kind = bytes[s.at++];
    if (kind === 0) { uleb(bytes, s); count++; }
    else if (kind === 1) { s.at++; const flags = uleb(bytes, s); uleb(bytes, s); if (flags & 1) uleb(bytes, s); }
    else if (kind === 2) { const flags = uleb(bytes, s); uleb(bytes, s); if (flags & 1) uleb(bytes, s); }
    else if (kind === 3) { s.at += 2; }
    else if (kind === 4) { uleb(bytes, s); uleb(bytes, s); }
    else throw new Error("unknown import kind");
  }
  if (s.at !== s.end) throw new Error("import section trailing bytes"); return count;
}

function names(bytes, row) {
  const s = { at: row.start, end: row.end }; if (string(bytes, s) !== "name") throw new Error("wrong custom section");
  const map = new Map();
  while (s.at < s.end) {
    const kind = bytes[s.at++], size = uleb(bytes, s), end = s.at + size;
    if (end > s.end) throw new Error("name subsection overrun");
    if (kind === 1) { const part = { at: s.at, end }; for (let n = uleb(bytes, part); n; --n) {
      const index = uleb(bytes, part), name = string(bytes, part);
      if (map.has(index)) throw new Error("duplicate function name"); map.set(index, name);
    } if (part.at !== end) throw new Error("function name subsection trailing bytes"); }
    s.at = end;
  }
  return map;
}

function decodeFramePrefix(bytes, state, name, show = false) {
  const seen = []; const readU = label => { const value = uleb(bytes, state); seen.push(`${label} ${value}`); return value; };
  const opcode = () => { if (state.at >= state.end) throw new Error(`truncated prologue: ${name}`); return bytes[state.at++]; };
  if (bytes[state.at] === 0x23) {
    opcode(); const getGlobal = readU("global.get");
    if (opcode() !== 0x41) throw new Error(`ambiguous prologue: ${name}`);
    const frame = sleb(bytes, state); seen.push(`i32.const ${frame}`);
    if (opcode() !== 0x6b) throw new Error(`ambiguous prologue: ${name}`); seen.push("i32.sub");
    const form = opcode();
    if (form === 0x24) {
      const setGlobal = readU("global.set");
      if (setGlobal !== getGlobal) throw new Error(`mismatched stack global: ${name}`);
    } else if (form === 0x22) {
      const local = readU("local.tee");
      if (opcode() !== 0x24) throw new Error(`ambiguous prologue: ${name}`);
      const setGlobal = readU("global.set");
      if (setGlobal !== getGlobal) throw new Error(`mismatched stack global: ${name}`);
      void local;
    } else if (form === 0x21) {
      const local = readU("local.set");
      if (opcode() !== 0x20) throw new Error(`ambiguous prologue: ${name}`);
      const got = readU("local.get");
      if (got !== local) throw new Error(`mismatched stack local: ${name}`);
      if (opcode() !== 0x24) throw new Error(`ambiguous prologue: ${name}`);
      const setGlobal = readU("global.set");
      if (setGlobal !== getGlobal) throw new Error(`mismatched stack global: ${name}`);
    } else throw new Error(`ambiguous prologue: ${name}`);
    if (frame < 0) throw new Error(`negative frame: ${name}`);
    return { frame, prefix: seen.join("; ") };
  }
  // A zero is a decoded result, not the absence of the four bytes recognized by
  // the old tool. Walk only simple prefix instructions and stop at a semantic
  // boundary; an undecodable prefix is deliberately not evidence of zero.
  for (let count = 0; count < 32 && state.at < state.end; count++) {
    const op = opcode();
    if ([0x02,0x03,0x04,0x0b,0x0f,0x10,0x11].includes(op) || (op >= 0x28 && op <= 0x3e)) {
      seen.push(`boundary 0x${op.toString(16)}`); return { frame: 0, prefix: seen.join("; ") };
    }
    if (op === 0x24) throw new Error(`hidden stack adjustment: ${name}`);
    if ([0x20,0x21,0x22,0x23].includes(op)) { const index = readU(`opcode 0x${op.toString(16)}`); void index; continue; }
    if (op === 0x41 || op === 0x42) { const value = sleb(bytes, state); seen.push(`const ${value}`); continue; }
    if (op === 0x43) { if (state.at + 4 > state.end) throw new Error(`truncated prologue: ${name}`); state.at += 4; continue; }
    if (op === 0x44) { if (state.at + 8 > state.end) throw new Error(`truncated prologue: ${name}`); state.at += 8; continue; }
    if (op === 0xfc) { const sub = uleb(bytes, state); seen.push(`boundary 0xfc ${sub}`);
      return { frame: 0, prefix: seen.join("; ") }; }
    if (op === 0x1a || (op >= 0x45 && op <= 0xc4)) { seen.push(`opcode 0x${op.toString(16)}`); continue; }
    throw new Error(`unknown prefix opcode 0x${op.toString(16)}: ${name}`);
  }
  throw new Error(`ambiguous decoded prefix: ${name}`);
}

function stackFrames(buffer, pattern, options = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  new WebAssembly.Module(bytes);
  const rows = sections(bytes), nameRows = rows.filter(row => row.id === 0 && (() => {
    try { const s = { at: row.start, end: row.end }; return string(bytes, s) === "name"; } catch { return false; }
  })());
  if (nameRows.length !== 1) throw new Error("expected exactly one name section");
  const nameMap = names(bytes, nameRows[0]); const imported = importedFunctions(bytes, rows.find(row => row.id === 2));
  const code = rows.find(row => row.id === 10); if (!code) throw new Error("missing code section");
  const s = { at: code.start, end: code.end }, count = uleb(bytes, s), found = [];
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const size = uleb(bytes, s), body = s.at, end = body + size; if (end > s.end) throw new Error("code body overrun");
    const q = { at: body, end }; for (let n = uleb(bytes, q); n; --n) { uleb(bytes, q); q.at++; }
    const name = nameMap.get(imported + ordinal); if (name && pattern.test(name)) {
      pattern.lastIndex = 0; const start = q.at;
      const decoded = decodeFramePrefix(bytes, q, name, options.showPrefix);
      found.push({ index: imported + ordinal, name, frame: decoded.frame, offset: start,
                   prefix: decoded.prefix });
    }
    s.at = end;
  }
  if (!found.length) throw new Error("requested names did not match"); return found;
}

module.exports = { uleb, sleb, decodeFramePrefix, stackFrames };

if (require.main === module) {
  const args = process.argv.slice(2), showPrefix = args.includes("--show-prefix");
  const plain = args.filter(value => value !== "--show-prefix"), [file, source] = plain;
  if (!file || !source) throw new Error("usage: wasm_stack_frames.js file regex [--show-prefix]");
  for (const row of stackFrames(fs.readFileSync(file), new RegExp(source), { showPrefix }))
    console.log(`${row.name}\t${row.frame}\t${row.offset}${showPrefix ? `\t${row.prefix}` : ""}`);
}
