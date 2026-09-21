import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("an unexpectedly exiting research parent terminates its owned child", { timeout: 15000 }, async () => {
  const helper = new URL("../research/owned-child.mjs", import.meta.url).href;
  const script = `
    import { spawn } from 'node:child_process';
    import { guardOwnedChild } from ${JSON.stringify(helper)};
    const child = guardOwnedChild(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],
      { windowsHide: true, stdio: 'ignore' }));
    child.once('spawn', () => {
      process.stdout.write(String(child.pid) + '\\n', () => {
        setImmediate(() => { throw new Error('injected checkpoint failure'); });
      });
    });
  `;
  const parent = spawn(process.execPath, ["--input-type=module", "-e", script],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  parent.stdout.on("data", (data) => { output += data; });
  parent.stderr.on("data", (data) => { errors += data; });
  try {
    const [code] = await once(parent, "close");
    assert.notEqual(code, 0);
    assert.match(errors, /injected checkpoint failure/);
    const pid = Number(output.trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally {
    parent.kill();
    const pid = Number(output.trim());
    if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, "SIGTERM"); } catch {} }
  }
});

test("Windows cleanup also removes the owned trainer's descendant", { timeout: 15000, skip: process.platform !== "win32" }, async () => {
  const helper = new URL("../research/owned-child.mjs", import.meta.url).href;
  const descendant = `const {spawn}=require('node:child_process');
    const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
    c.once('spawn',()=>console.log(JSON.stringify([process.pid,c.pid]))); setInterval(()=>{},1000);`;
  const script = `import {spawn} from 'node:child_process';
    import {guardOwnedChild} from ${JSON.stringify(helper)};
    const c=guardOwnedChild(spawn(process.execPath,['-e',${JSON.stringify(descendant)}],
      {windowsHide:true,stdio:['ignore','pipe','ignore']}));
    c.stdout.once('data',data=>process.stdout.write(data,()=>process.exit(9)));`;
  const parent = spawn(process.execPath, ["--input-type=module", "-e", script],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  let output = "", pids = [];
  parent.stdout.on("data", (data) => { output += data; });
  try {
    const [code] = await once(parent, "close");
    assert.equal(code, 9);
    pids = JSON.parse(output.trim());
    assert.equal(pids.length, 2);
    for (const pid of pids) {
      assert.ok(Number.isInteger(pid) && pid > 0);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
  } finally {
    parent.kill();
    for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch {} }
  }
});
