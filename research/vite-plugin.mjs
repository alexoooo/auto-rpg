import { resolve } from "node:path";
import { fingerprint, ROOT } from "./fingerprint.mjs";

export function ratingFingerprintPlugin() {
  const id = "\0virtual:ai-fingerprint";
  let dependencies = new Set();
  return { name: "ai-rating-fingerprint",
    resolveId(source) { if (source === "virtual:ai-fingerprint") return id; },
    load(source) {
      if (source !== id) return;
      const result = fingerprint();
      dependencies = new Set(result.files.map((file) => resolve(ROOT, file)));
      return `export default ${JSON.stringify(result.hash)};`;
    },
    configureServer(server) {
      server.watcher.on("change", (file) => {
        if (!dependencies.has(resolve(file))) return;
        const module = server.moduleGraph.getModuleById(id);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
