import { execFileSync } from "node:child_process";

/** Only accepts the ChildProcess we spawned, never an enumerated or inferred PID. */
export function terminateOwnedChild(child) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0 || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore", timeout: 5000 });
    } catch { child.kill(); }
  } else child.kill("SIGTERM");
}

/** Synchronous exit cleanup also runs after an uncaught checkpoint callback error.
 * Normal child completion removes the hook, so completed/reused PIDs are never targeted. */
export function guardOwnedChild(child) {
  const cleanup = () => terminateOwnedChild(child);
  process.once("exit", cleanup);
  child.once("exit", () => process.off("exit", cleanup));
  return child;
}
