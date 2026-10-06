/** Numeric settings: 600 active frames, excluding the first 2 simulated seconds, published every 500 ms. */
const WINDOW = { frames: 600, startup: 2, publish: 500 } as const;

interface FrameSample {
  readonly frame: number;
  readonly interval: number;
  readonly physics: number;
  readonly simulated: number;
  readonly time: number;
  readonly hz: number;
  readonly active: boolean;
}

/** Optional page measurement; timing stays outside the world and has no control or physics authority. */
export function arenaMeasurement(parent: HTMLElement) {
  const output = document.createElement("output");
  output.id = "arena-measurement"; output.setAttribute("aria-label", "Arena frame measurement");
  Object.assign(output.style, { position: "fixed", bottom: "12px", left: "12px", zIndex: "10",
    background: "#101318e8", color: "#e3e7ed", padding: "8px", font: "12px monospace", pointerEvents: "none", whiteSpace: "pre" });
  output.textContent = "Measuring active combat…"; parent.append(output);
  const samples: FrameSample[] = []; let last = 0;
  const percentile = (values: number[], part: number) => {
    values.sort((a, b) => a - b); return values[Math.floor((values.length - 1) * part)]!;
  };
  return { record(sample: FrameSample) {
    if (!sample.active || sample.time < WINDOW.startup || sample.simulated <= 0 || samples.length >= WINDOW.frames) return;
    samples.push(sample);
    const now = performance.now();
    if (now - last < WINDOW.publish && samples.length < WINDOW.frames) return;
    last = now;
    const simulated = samples.reduce((sum, s) => sum + s.simulated, 0), interval = samples.reduce((sum, s) => sum + s.interval, 0);
    const steps = Math.round(samples.reduce((sum, s) => sum + s.simulated * s.hz, 0));
    const physics = samples.reduce((sum, s) => sum + s.physics, 0);
    const result = { frames: samples.length, steps, hz: sample.hz, simulated,
      meanStepMs: physics / steps,
      batchStepP95Ms: percentile(samples.map(s => s.physics / (s.simulated * s.hz)), .95),
      frameCpuMedianMs: percentile(samples.map(s => s.frame), .5), frameCpuP95Ms: percentile(samples.map(s => s.frame), .95),
      frameIntervalMedianMs: percentile(samples.map(s => s.interval), .5), simulatedPerReal: simulated * 1000 / interval };
    output.dataset.measurement = JSON.stringify(result);
    output.textContent = `${result.frames} frames · ${result.steps} physics steps at ${result.hz} Hz\n`
      + `step mean ${result.meanStepMs.toFixed(2)} ms · batch p95 ${result.batchStepP95Ms.toFixed(2)} ms\n`
      + `frame CPU median ${result.frameCpuMedianMs.toFixed(2)} ms · p95 ${result.frameCpuP95Ms.toFixed(2)} ms\n`
      + `simulation / real time ${result.simulatedPerReal.toFixed(2)}`;
  }, dispose() { output.remove(); } };
}
