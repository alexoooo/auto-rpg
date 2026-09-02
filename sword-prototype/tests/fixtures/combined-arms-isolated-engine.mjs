let active = false;

export async function runCombinedArmsQualificationBout(job, options = {}) {
  if (job.fail === true) throw new Error("synthetic qualification failure");
  if (active) throw new Error("two qualification jobs overlapped in one JavaScript realm");
  active = true;
  try {
    if (job.executions instanceof SharedArrayBuffer) {
      Atomics.add(new Int32Array(job.executions), 0, 1);
    }
    await new Promise((resolve) => setImmediate(resolve));
    return Object.freeze({ index: job.value, doubled: job.value * 2,
      label: options.label ?? "synthetic",
      ...(Number.isSafeInteger(job.payloadBytes) && job.payloadBytes > 0
        ? { payload: "x".repeat(job.payloadBytes) } : {}) });
  } finally {
    active = false;
  }
}
