import { parentPort } from "node:worker_threads";
parentPort.on("message", ({ job, manifest }) => {
  if (manifest.crash) throw new Error("intentional fixture failure");
  // A job that takes `delayMs` of wall time before answering, for the wall-limit test.
  setTimeout(() => parentPort.postMessage({ ...job, status: "ok", winner: null }), manifest.delayMs ?? 0);
});
