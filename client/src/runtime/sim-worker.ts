/**
 * The one place a simulation worker is constructed.
 *
 * **A module of its own for two reasons, and only one of them is Vite's.** Vite
 * uses this exact `new Worker(new URL(..., import.meta.url))` syntax to discover
 * the module worker and emit it as its own chunk, so the literal has to stay at
 * the construction site -- which means it cannot be inlined into whatever
 * happens to want a worker. And `import.meta` compiles under an ES module target
 * and not under CommonJS, so a class that carried this line could not be
 * required by a Node test at all; taking the factory as an argument is what lets
 * `ArenaClient`'s correlation rules be driven against a fake.
 *
 * `#/game` builds its own through `SimClient`, from the same module URL, so the
 * two routes share one emitted chunk and one `/web.wasm` fetch policy.
 */
export function createSimWorker(): Worker {
  return new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
}
