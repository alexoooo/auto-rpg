import { parentPort } from "node:worker_threads";

parentPort.postMessage({ ready: true });
parentPort.on("message", () => process.exit(0));
