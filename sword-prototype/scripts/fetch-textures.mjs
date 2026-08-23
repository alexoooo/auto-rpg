// Fetches the PBR textures the warriors and their gear are surfaced with.
//
// Same arrangement as `fetch-polyhaven.mjs` and for the same reasons: Poly Haven
// publishes everything under CC0, so this carries no attribution obligation into
// the repository, and every file is pinned by id **and** by digest rather than
// by "whatever the API returns today". A texture that silently changes is a
// warrior that silently changes.
//
//     node scripts/fetch-textures.mjs
//     node scripts/fetch-textures.mjs --verify   (checks, downloads nothing)
//
// Why textures at all, when nothing here had one until now: the authored warrior
// is twenty-one welded primitives painted in four flat colours, lit only by an
// HDRI, and a flat colour on a smooth shell is what reads as plastic. Silhouette
// is the other half of the answer and is `build_warrior.py`'s; this half is
// that a normal map costs nothing at run time and does more for how a
// breastplate catches the light than any amount of extra geometry would.
//
// These are **tiling** maps rather than a hand-painted atlas, which is the
// honest choice for an asset nobody is going to hand-paint: it gives steel the
// grain of steel everywhere, and it will never give a face the grain of a face.
// Flesh is deliberately left bare for exactly that reason.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Which Poly Haven set stands in for each of the arena's surfaces.
 *
 * The choices are about *scale* as much as about looks. A 1 k tile covering half
 * a metre of a fighter has grain a person can read at arena range; the same tile
 * covering three metres reads as a smear and the same tile covering five
 * centimetres reads as noise. `cloth` is a plaster rather than a fabric on
 * purpose -- it is a near-neutral broken weave that takes the per-side crimson
 * and blue tint cleanly, where a fabric with its own colour would fight it.
 */
const SETS = [
  { role: "steel", id: "metal_plate_02" },
  { role: "leather", id: "fabric_leather_02" },
  { role: "cloth", id: "rough_plaster_broken" },
  { role: "wood", id: "wood_planks" },
];

/**
 * One map per set: the normal, and only the normal.
 *
 * The diffuse and roughness maps were fetched and wired first, looked at, and
 * dropped. `src/arena.ts` carries the argument at length; the short version is
 * that Babylon multiplies a diffuse map by `albedoColor`, a photographic diffuse
 * averages well below white, and the whole scene came out at about a third of
 * its intended brightness -- while the palette colours are the identity of each
 * surface and the thing a surcoat is tinted with, so they are not the half to
 * give up. Dropping the other two also takes this fetch from 6 MB to 1.7 MB.
 *
 * `nor_gl` is the OpenGL convention -- green channel up -- which is what Babylon
 * expects. Poly Haven also publishes `nor_dx`, and using it makes every surface
 * light as though the sun were underneath it, which is subtle enough to look
 * like a lighting problem rather than a wrong file.
 */
const MAPS = ["nor_gl"];

/** id -> map -> sha256 of the 1k JPEG. Recorded when the file was first taken. */
const DIGESTS = {
  metal_plate_02: {
    diff: "6e80877d0e9d5973d96298c6091df7ace906b0a6760afc4f3592e4855f3f1d4c",
    nor_gl: "58736fbb8aa4fc6690cf8152b174db65caf22a766375b625fb0087e1bc955bc7",
    rough: "73a6bd6393f6de7be42058584c2d382f2a3e9148ceabc2d02e748e2c860e74d1",
  },
  fabric_leather_02: {
    diff: "97ba9480c7619efc9b8c08202c3e3773d1dd532dacce4dfe97f86e95339cf132",
    nor_gl: "2652ece55bd2780be1e16fb5ebc4171b139da45bcf9839a161b9ae236534e471",
    rough: "bce3c63ead508ffa0c110c176fdd94e5dbf57b51efdbc6781026a21e217b0edd",
  },
  rough_plaster_broken: {
    diff: "ef13cbf8529f8b4b6a5b9628111a96f262f30c68d265964277b1976336885db1",
    nor_gl: "f0534b35c0304a0c7f969095a014bea616bcb4b4eb0646a669e9062692ae16f6",
    rough: "8f7e33101489424eb2979b3367d0f22ff2dbc804d054f19102d324731ae8239c",
  },
  wood_planks: {
    diff: "3b0669f683e4bf10f5a55a381cfa9669a7b8dfd921901829daa3b35acc2bbdec",
    nor_gl: "d02abf113e17a8abe97e1be3e9d6d88add242e8c2291e2200d37aa8c68909f25",
    rough: "1b7f115bfa25619b0a2db554eb1ab88a6fc5ef0b74ba4890611eae04d00b9829",
  },
};

const LICENCE = "CC0";

const url = (id, map) =>
  `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${map}_1k.jpg`;

/** Where it lands. Named by role, not by Poly Haven's id, so swapping a set is
 *  a change to this file and to nothing that reads the files. */
const target = (role, map) => `public/assets/textures/${role}_${map}.jpg`;

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  let missing = 0;
  let fetched = 0;

  await mkdir(resolve(ROOT, "public/assets/textures"), { recursive: true });

  for (const set of SETS) {
    for (const map of MAPS) {
      const path = target(set.role, map);
      const full = resolve(ROOT, path);
      const want = DIGESTS[set.id][map];

      const existing = await readFile(full).catch(() => null);
      if (existing) {
        const got = digest(existing);
        if (got === want) continue;
        console.error(`${path} digest ${got}\n  expected ${want}`);
        process.exit(1);
      }

      if (verifyOnly) {
        console.error(`missing ${path} -- run: node scripts/fetch-textures.mjs`);
        missing += 1;
        continue;
      }

      const response = await fetch(url(set.id, map));
      if (!response.ok) {
        console.error(`${url(set.id, map)} -- HTTP ${response.status}`);
        process.exit(1);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const got = digest(bytes);
      if (got !== want) {
        console.error(
          `${set.id}/${map} came back with digest ${got}\n` +
            `  expected ${want}\n` +
            "  The published file has changed. Look at it before repinning: a\n" +
            "  texture that changes silently changes every surface in the scene.",
        );
        process.exit(1);
      }
      await writeFile(full, bytes);
      console.log(`fetched ${path} (${(bytes.length / 1024).toFixed(0)} KB, ${LICENCE})`);
      fetched += 1;
    }
  }

  if (missing) process.exit(1);
  console.log(
    fetched === 0
      ? `all ${SETS.length * MAPS.length} textures present and match their pins.`
      : `${fetched} fetched, ${LICENCE}, from Poly Haven.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
