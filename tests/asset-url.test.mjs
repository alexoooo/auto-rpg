import test from "node:test";
import assert from "node:assert/strict";
import { publicAssetUrl } from "../src/asset-url.ts";

test("public assets resolve inside both root and GitHub Pages deployments", () => {
  for (const base of ["/", "/auto-rpg/"]) {
    for (const path of ["/assets/env.hdr", "assets/forge/forge-kit.glb", "/assets/textures/stone.jpg"]) {
      const resolved = new URL(publicAssetUrl(path, base), `https://example.com${base}index.html`);
      assert.equal(resolved.pathname, base + path.replace(/^\//, ""));
    }
  }
  assert.equal(publicAssetUrl("/assets/env.hdr"), "/assets/env.hdr");
});
