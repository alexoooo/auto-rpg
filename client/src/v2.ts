import { HEADER_UNIT_COUNT } from "./protocol/abi.generated.js";
import type { LegacyClientCommand } from "./protocol/messages.js";
import { SimClient, type ClientDiagnostics } from "./runtime/sim-client.js";

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`v2.html is missing #${id}`);
  return found as T;
};
const integerFrom = (id: string, minimum: number, maximum: number): number => {
  const value = Number(element<HTMLInputElement>(id).value);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${id} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
};
const seedFromPage = (): number => integerFrom("seed", 0, 0xffff_ffff);

const status = element<HTMLOutputElement>("status");
const errorOutput = element<HTMLOutputElement>("error");
const diagnosticsOutput = element<HTMLPreElement>("diagnostics");
const pauseButton = element<HTMLButtonElement>("pause");
const holdBuffersButton = element<HTMLButtonElement>("diagnostic-hold-buffers");
const releaseBuffersButton = element<HTMLButtonElement>("diagnostic-release-buffers");
const client = new SimClient(new Worker(new URL("./runtime/sim.worker.ts", import.meta.url), { type: "module" }));
let latest: ClientDiagnostics = client.diagnostics();

const renderDiagnostics = (): void => {
  const units = client.snapshot()?.view.frame[HEADER_UNIT_COUNT] ?? 0;
  diagnosticsOutput.textContent = JSON.stringify({ ...latest, visibleEntities: units }, null, 2);
};

client.onDiagnostics = (diagnostics) => {
  latest = diagnostics;
  pauseButton.textContent = diagnostics.paused ? "Resume" : "Pause";
  holdBuffersButton.disabled = diagnostics.diagnosticBufferExhaustion;
  releaseBuffersButton.disabled = !diagnostics.diagnosticBufferExhaustion;
  renderDiagnostics();
};
client.onSnapshot = () => renderDiagnostics();
client.onError = (error) => { errorOutput.value = error.message; };

const run = (operation: () => Promise<unknown>, label: string): void => {
  errorOutput.value = "";
  void Promise.resolve().then(operation).then(() => { status.value = label; }).catch((error: unknown) => {
    errorOutput.value = error instanceof Error ? error.message : String(error);
  });
};
const applyCommand = async (command: LegacyClientCommand): Promise<void> => {
  const acknowledgement = await client.command(command);
  if (acknowledgement.status !== "applied") {
    throw new Error(`command rejected: ${acknowledgement.reason ?? "unknown reason"}`);
  }
};

element<HTMLButtonElement>("reset").addEventListener("click", () => {
  run(() => client.reset(seedFromPage(), latest.paused), "Reset complete");
});
pauseButton.addEventListener("click", () => {
  run(() => client.setPaused(!latest.paused), latest.paused ? "Running" : "Paused");
});
element<HTMLButtonElement>("goto").addEventListener("click", () => {
  run(() => applyCommand({
    kind: "goto",
    xMilli: integerFrom("goto-x", -0x8000_0000, 0x7fff_ffff),
    yMilli: integerFrom("goto-y", -0x8000_0000, 0x7fff_ffff),
  }), "Goto applied");
});
element<HTMLButtonElement>("withdraw").addEventListener("click", () => {
  run(() => applyCommand({ kind: "withdraw" }), "Order cleared");
});
element<HTMLButtonElement>("spawn").addEventListener("click", () => {
  run(() => applyCommand({ kind: "spawn", kindCode: 2, primary: 0, secondary: 255 }), "Spawn applied");
});
holdBuffersButton.addEventListener("click", () => {
  run(async () => client.beginDiagnosticBufferExhaustion(), "Holding the next three snapshot leases");
});
releaseBuffersButton.addEventListener("click", () => {
  run(async () => client.releaseDiagnosticBufferExhaustion(), "Released all diagnostic snapshot leases");
});

let previousTime = performance.now();
let pendingElapsedMicros = 0;
let advanceInFlight = false;
const frame = (now: number): void => {
  const elapsedMicros = Math.max(0, Math.round((now - previousTime) * 1000));
  previousTime = now;
  if (latest.resetting) pendingElapsedMicros = 0;
  else pendingElapsedMicros += elapsedMicros;
  if (!advanceInFlight && !latest.resetting && !latest.terminal && latest.epoch !== 0) {
    const elapsed = pendingElapsedMicros;
    pendingElapsedMicros = 0;
    advanceInFlight = true;
    void client.advance(elapsed).catch(() => undefined).finally(() => { advanceInFlight = false; });
  }
  requestAnimationFrame(frame);
};

run(() => client.init(seedFromPage()), "Worker ready");
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => client.dispose(), { once: true });
