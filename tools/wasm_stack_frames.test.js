"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { uleb, sleb, decodeFramePrefix } = require("./wasm_stack_frames.js");

function unsigned(value) { const out=[]; do { let b=value&127; value=Math.floor(value/128); if(value)b|=128; out.push(b); } while(value); return out; }
function signed(value) { const out=[]; let more=true; while(more){let b=value&127; value>>=7; more=!((value===0&&(b&64)===0)||(value===-1&&(b&64)!==0)); if(more)b|=128; out.push(b);} return out; }

test("signed and unsigned LEB decode every declared frame", () => {
  for (const value of [0, 516, 1032, 7248, 88960, 139904]) {
    let bytes=Uint8Array.from(unsigned(value)), state={at:0,end:bytes.length}; assert.equal(uleb(bytes,state),value); assert.equal(state.at,bytes.length);
    bytes=Uint8Array.from(signed(value)); state={at:0,end:bytes.length}; assert.equal(sleb(bytes,state),value); assert.equal(state.at,bytes.length);
  }
});
test("LEB readers refuse truncation", () => {
  assert.throws(()=>uleb(Uint8Array.of(0x80),{at:0,end:1}),/truncated/);
  assert.throws(()=>sleb(Uint8Array.of(0x80),{at:0,end:1}),/truncated/);
});

function prefix(bytes) {
  const input=Uint8Array.from(bytes), state={at:0,end:input.length};
  return decodeFramePrefix(input,state,"fixture");
}

test("Rust direct tee and set-get stack prologues decode exact frame bytes", () => {
  for (const frame of [0,16,516,1032,7248,88960,139904,352176]) {
    const head=[0x23,...unsigned(130),0x41,...signed(frame),0x6b];
    assert.equal(prefix([...head,0x24,...unsigned(130)]).frame,frame);
    assert.equal(prefix([...head,0x22,...unsigned(131),0x24,...unsigned(130)]).frame,frame);
    assert.equal(prefix([...head,0x21,...unsigned(131),0x20,...unsigned(131),0x24,...unsigned(130)]).frame,frame);
  }
});

test("zero frames require a decoded prefix with no stack adjustment", () => {
  assert.equal(prefix([0x20,0x81,0x01,0x41,0,0x6a,0x10,0]).frame,0);
  assert.equal(prefix([0x41,0,0x04,0x40]).frame,0);
  assert.equal(prefix([0x20,0,0xfc,0x0b]).frame,0);
});

test("mismatched or hidden stack prologues refuse as ambiguous", () => {
  assert.throws(()=>prefix([0x23,1,0x41,1,0x6b,0x24,2]),/mismatched stack global/);
  assert.throws(()=>prefix([0x23,1,0x41,1,0x6b,0x21,3,0x20,4,0x24,1]),/mismatched stack local/);
  assert.throws(()=>prefix([0x23,1,0x41,0x7f,0x6b,0x24,1]),/negative frame/);
  assert.throws(()=>prefix([0x23,1,0x41,1,0x6a,0x24,1]),/ambiguous/);
  assert.throws(()=>prefix([0x20,0,0x24,1]),/hidden stack adjustment/);
  assert.throws(()=>prefix([0x06]),/unknown prefix opcode/);
  assert.throws(()=>prefix([0x23,0x80]),/truncated unsigned LEB/);
});
