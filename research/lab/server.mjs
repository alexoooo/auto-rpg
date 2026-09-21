/** Versioned JSON-lines bridge: stdout is protocol only; one sequential Havok world. */
import { createInterface } from "node:readline";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createEnvironment } from "./environment.mjs";
import { OBSERVATION_NAMES, LAB_VERSION, actionSize, infer, validateNetwork } from "../../src/golem/lab-policy.ts";
Logger.LogLevels = Logger.ErrorLogLevel;
let env = null;
const close = () => { env?.close(); env = null; };
process.on("SIGINT", () => { close(); process.exit(130); });
process.on("SIGTERM", () => { close(); process.exit(143); });
// A killed Python trainer must not leave a simulator holding native modules open.
const parent = Number(process.argv[2]);
const watch = Number.isInteger(parent) && parent > 0 ? setInterval(() => {
  try { process.kill(parent, 0); } catch { close(); process.exit(0); }
}, 1000) : null;
try {
  for await (const line of createInterface({ input: process.stdin })) {
    let request;
    try {
      request = JSON.parse(line);
      let result;
      switch (request.op) {
        case "reset":
          close(); env = await createEnvironment(request.config);
          result = { version: LAB_VERSION, observationNames: OBSERVATION_NAMES,
            actionSize: actionSize(env.config.surface), observation: env.observation() }; break;
        case "step":
          if (!env) throw new Error("reset required");
          // Batch transport without introducing concurrent worlds or changing the physics clock.
          if (!Array.isArray(request.actions) || request.actions.length < 1 || request.actions.length > 120) throw new Error("invalid batch size");
          result = [];
          for (const action of request.actions) { const row = env.step(action); result.push(row); if (row.terminated || row.truncated) break; }
          break;
        case "infer": validateNetwork(request.model); result = request.observations.map((o) => infer(request.model, o)); break;
        case "close": close(); result = { closed: true }; break;
        default: throw new Error("unknown bridge operation");
      }
      process.stdout.write(JSON.stringify({ id: request.id, ok: true, result }) + "\n");
    } catch (error) { close(); process.stdout.write(JSON.stringify({ id: request?.id, ok: false, error: String(error) }) + "\n"); }
  }
} finally { if (watch) clearInterval(watch); close(); }
