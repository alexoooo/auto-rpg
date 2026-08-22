// Fetches the environment map the arena lights itself with.
//
// Poly Haven publishes everything under CC0, so this needs no attribution and
// carries no licence obligation into the repository. The asset id and the digest
// are pinned here rather than "whatever the API returns today", because an
// environment map silently changing is an environment map that silently changes
// how every material in the scene looks.
//
//     node scripts/fetch-polyhaven.mjs
//     node scripts/fetch-polyhaven.mjs --verify   (checks, downloads nothing)

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const ASSET = {
  id: "kloofendal_43d_clear",
  // A clear sun with a high dynamic range: the one property that makes a steel
  // blade read as steel rather than as a grey box.
  url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_43d_clear_1k.hdr",
  target: "public/assets/env.hdr",
  licence: "CC0",
  sha256: "5077cc68a6fe4d0606099f871a8fe47162dbc48956c7d8d952f43ab40442bb11",
};

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  const target = resolve(ROOT, ASSET.target);

  if (verifyOnly) {
    const existing = await readFile(target).catch(() => null);
    if (!existing) {
      console.error(`missing ${ASSET.target} -- run: node scripts/fetch-polyhaven.mjs`);
      process.exit(1);
    }
    const actual = digest(existing);
    if (actual !== ASSET.sha256) {
      console.error(`${ASSET.target} digest ${actual}\n  expected ${ASSET.sha256}`);
      process.exit(1);
    }
    console.log(`${ASSET.target} matches its pin.`);
    return;
  }

  console.log(`fetching ${ASSET.id} (${ASSET.licence}) ...`);
  const response = await fetch(ASSET.url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${ASSET.url}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = digest(buffer);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);

  console.log(`wrote ${ASSET.target}  ${(buffer.length / 1024).toFixed(0)} KB`);
  if (actual !== ASSET.sha256) {
    console.log(
      `\nNOTE: digest is ${actual}\n` +
        `      the pin in this script says ${ASSET.sha256}\n` +
        `      If this is the first fetch, paste the digest above into ASSET.sha256.`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
