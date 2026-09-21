import { parentPort } from "node:worker_threads";
parentPort.on("message", ({ job, manifest }) => {
  if (manifest.crash) throw new Error("intentional fixture failure");
  parentPort.postMessage({ ...job, status: "ok", winner: null });
});
