// ============================================================== web/assets.js
//
// **The manifest, and the images it names.**
//
// `web/assets/manifest.json` is the only place a filename appears. Nothing in
// `web/*.js` spells one: a draw site asks for a *key* -- `env/floor_b`,
// `actors/fighter`, `weapons/test_bar` -- and which file that resolves to, at
// which facing and which frame, is the manifest's business. `{facing}` and
// `{frame}` are substituted from the manifest's own lists **once, at parse**,
// which is why a Fighter is four lines of JSON rather than thirty-two and why
// nothing builds a path in the render loop.
//
// **Nothing here is on the critical path.** The manifest is fetched once at
// boot and the game neither waits for it nor notices it arrive; an `Image` is
// created the first time something asks for its key, so a floor never seen is a
// file never fetched. Every way this can go wrong -- no manifest, a manifest
// that will not parse, a key nobody put in it, a 404, a decode that fails --
// resolves to exactly one thing: `assetPaint` returns `DL_NO_PAINT`, the draw
// site takes the `art-05` fallback it already has, and **at most one warning is
// printed for the life of the page**. One and not one per failure, because a
// room whose thirty-two body frames are all missing would otherwise print
// thirty-two lines and bury the first.
//
// **`onerror` is final.** A failed entry is failed forever and nothing retries
// it: a retry is one request per frame at sixty frames a second against a file
// that is not there, which is how a missing asset becomes a network problem.
//
// **What crosses to `main.js` is a paint-table index and never an
// `HTMLImageElement`** -- `art-04` §3, and it is the whole of the insurance. The
// image goes straight into the paint table on arrival, as a `CanvasPattern` for
// a `surface` (which is the thing that tiles) and as itself for everything
// else, so extract references it by number and the same manifest drives a
// backend that has textures instead of images.
//
// A classic script, loaded after `draw.js` -- it registers into the paint table
// and needs `dlPaintStatic` at first use -- and before `main.js`.

/** The directory every `file` in the manifest is relative to, and the manifest
 *  itself. Two strings, and they are the only paths in `web/*.js`. */
const ASSET_DIR = "assets/";
const ASSET_MANIFEST_URL = ASSET_DIR + "manifest.json";

/** Three states, and the third is a terminal one. */
const ASSET_PENDING = 0;
const ASSET_READY = 1;
const ASSET_FAILED = 2;

/**
 * The review instrument, and the reason `art-06`, `art-07` and `art-08` are
 * reviewable at all: each of them has to compare a sprite against the fallback
 * it replaced, and doing that by renaming files takes an afternoon and leaves
 * the tree dirty.
 *
 * **A predicate over the list rather than a branch at every site.** Every draw
 * site is already `const p = assetPaint(k); if (p >= 0) {...} else {...fallback}`,
 * so turning this off is one early return in `assetOf` and every site takes the
 * arm it already had. There is nothing to keep in sync, and so nothing that can
 * drift out of sync with the sites it is supposed to be A/B-ing.
 *
 * Default true, `?noart=1` at load, and a plain global the console can assign
 * to -- a top-level `let` in a classic script is exactly that.
 */
let assetsEnabled = new URLSearchParams(location.search).get("noart") !== "1";

/** The parsed manifest: key -> entry, with the substitution already done.
 *  `null` until it arrives, and `null` forever if it never does. */
let assetManifest = null;

/** The manifest's own scale. Read by the actor transform, which has to know how
 *  many source pixels a world unit is to place a cell in billboard space. */
let assetPxPerWorldUnit = 0;

/** The size of the image the last `assetPaint`/`assetActorPaint` resolved, in
 *  source pixels. Out-params for `rigProject`'s reason: a returned pair would
 *  allocate once per sprite per frame, and the render path allocates nothing. */
let assetOutW = 0;
let assetOutH = 0;

let assetWarned = false;

function assetWarn(what) {
  if (assetWarned) return;
  assetWarned = true;
  console.warn(`assets: ${what} -- falling back, and not asking again`);
}

/** One file, one `Image`, one paint-table slot. Built empty at parse; the
 *  `Image` itself arrives on the first ask and never before. */
function assetLeaf(file, repeat) {
  return {
    file: file,
    repeat: repeat,
    state: ASSET_PENDING,
    paint: DL_NO_PAINT,
    copies: null,
    img: null,
    w: 0,
    h: 0,
  };
}

/**
 * The manifest as the renderer wants it: one leaf per *file*, with `{facing}`
 * and `{frame}` already substituted out of the manifest's own lists.
 *
 * Throws on anything it does not understand, which the caller turns into the
 * one warning. That is deliberate -- a half-parsed manifest is worse than none,
 * because half of the room would come out of the fallback and half out of the
 * images, and the difference would read as an art defect.
 */
function assetParse(m) {
  const out = new Map();
  const src = m.assets;
  for (const key of Object.keys(src)) {
    const entry = src[key];
    if (entry.kind === "actor") {
      // `slots[facing]` for a layer with no frames, `slots[facing][frame]` for
      // one with them. Indices and not names, so a draw site addresses a frame
      // with two integers it already has rather than a string it has to build.
      for (const name of Object.keys(entry.layers)) {
        const layer = entry.layers[name];
        layer.slots = entry.facings.map((f) =>
          layer.frames
            ? layer.frames.map((fr) => assetLeaf(layer.file.replace("{facing}", f).replace("{frame}", fr), false))
            : assetLeaf(layer.file.replace("{facing}", f), false)
        );
      }
      entry.leaf = null;
    } else if (entry.frames !== undefined) {
      // An environmental animation is one manifest entry for the same reason an
      // actor layer is: the naming pattern belongs to the data, and a painter
      // chooses an integer frame without ever spelling a filename. Unlike an
      // actor it has no facing axis, so `slots` is one flat row.
      entry.slots = entry.frames.map((fr) => assetLeaf(entry.file.replace("{frame}", fr), false));
      entry.leaf = null;
    } else {
      // A face is a pattern too. Its image is authored straight-on and repeats
      // through a matrix carrying one of the wall plane's two screen bases;
      // `art-07` is where the second transform first exercises this arm.
      entry.leaf = assetLeaf(entry.file, entry.kind === "surface" || entry.kind === "face");
    }
    out.set(key, entry);
  }
  assetPxPerWorldUnit = m.px_per_world_unit;
  return out;
}

/** The image arrived. Straight into the paint table, and a repeating surface or
 *  face goes in as the `CanvasPattern` it will be used as -- `dlPatternStatic`
 *  is the paint source builder that exists for exactly this, and it keeps
 *  `createPattern` on `draw.js`'s side of the seam. */
function assetArrived(leaf, img) {
  leaf.w = img.naturalWidth;
  leaf.h = img.naturalHeight;
  const paint = leaf.repeat ? dlPatternStatic(img, "repeat") : dlPaintStatic(img);
  if (paint === DL_NO_PAINT || !(leaf.w > 0) || !(leaf.h > 0)) {
    leaf.state = ASSET_FAILED;
    assetWarn(`${leaf.file} loaded but the paint table would not hold it`);
    return;
  }
  leaf.paint = paint;
  if (leaf.repeat) leaf.copies = [paint];
  leaf.state = ASSET_READY;
}

/** The paint index for one leaf, and the lazy `new Image()` that a first ask
 *  costs. Everything public below funnels through here. */
function assetPaintOf(leaf) {
  if (leaf.state === ASSET_READY) {
    assetOutW = leaf.w;
    assetOutH = leaf.h;
    return leaf.paint;
  }
  if (leaf.state === ASSET_PENDING && leaf.img === null) {
    const img = new Image();
    leaf.img = img;
    img.onload = () => assetArrived(leaf, img);
    img.onerror = () => {
      leaf.state = ASSET_FAILED;
      assetWarn(`${leaf.file} did not load`);
    };
    img.src = ASSET_DIR + leaf.file;
  }
  return DL_NO_PAINT;
}

/** The manifest entry for a key, or `null` -- for an unknown key, for a
 *  manifest that has not arrived or never will, and for `assetsEnabled` off.
 *  The entry is the manifest's own object, so `world`, `hilt`, `tip`, `cell`
 *  and `anchor` are read off it directly and nothing is copied. */
function assetOf(key) {
  if (!assetsEnabled || assetManifest === null) return null;
  const entry = assetManifest.get(key);
  return entry === undefined ? null : entry;
}

/** The paint index for a single-file key, or `DL_NO_PAINT`. Sets `assetOutW`
 *  and `assetOutH`. */
function assetPaint(key) {
  const entry = assetOf(key);
  return entry === null || entry.leaf === null ? DL_NO_PAINT : assetPaintOf(entry.leaf);
}

/**
 * One of several independently aimed patterns over the same image.
 *
 * A wall's `+x` and `+y` faces use one authored rectangle and two matrices. A
 * `CanvasPattern` holds only one matrix, and the display list is replayed after
 * extraction has emitted both fills, so mutating one object twice would make
 * both faces take the last matrix written. Copies share the decoded `Image` and
 * differ only in that six-number transform. `copy = 0` is the leaf's ordinary
 * paint and costs nothing extra.
 */
function assetPatternPaint(key, copy) {
  const entry = assetOf(key);
  if (entry === null || entry.leaf === null || !entry.leaf.repeat) return DL_NO_PAINT;
  const leaf = entry.leaf;
  if (assetPaintOf(leaf) < 0 || leaf.copies === null) return DL_NO_PAINT;
  while (leaf.copies.length <= copy) {
    const paint = dlPatternStatic(leaf.img, "repeat");
    if (paint === DL_NO_PAINT) return DL_NO_PAINT;
    leaf.copies.push(paint);
  }
  assetOutW = leaf.w;
  assetOutH = leaf.h;
  return leaf.copies[copy];
}

/** One frame of a non-actor animation, addressed by the manifest's own row. */
function assetAnimationPaint(key, frame) {
  const entry = assetOf(key);
  if (entry === null || entry.slots === undefined) return DL_NO_PAINT;
  const leaf = entry.slots[frame];
  return leaf === undefined ? DL_NO_PAINT : assetPaintOf(leaf);
}

/** The paint index for one layer of one actor at one facing and one frame, by
 *  index into the manifest's own `facings` and `frames` lists. */
function assetActorPaint(key, layer, facing, frame) {
  const entry = assetOf(key);
  if (entry === null || entry.layers === undefined) return DL_NO_PAINT;
  const l = entry.layers[layer];
  if (l === undefined || l.slots === undefined) return DL_NO_PAINT;
  const row = l.slots[facing];
  if (row === undefined) return DL_NO_PAINT;
  const leaf = l.frames === undefined ? row : row[frame];
  return leaf === undefined ? DL_NO_PAINT : assetPaintOf(leaf);
}

// Off the critical path, and unconditional: the fetch runs even with the art
// switched off, so that turning `assetsEnabled` back on from the console is a
// live A/B rather than a reload. It is one small JSON either way.
if (typeof fetch === "function") {
  fetch(ASSET_MANIFEST_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`${ASSET_MANIFEST_URL} answered ${r.status}`);
      return r.json();
    })
    .then((m) => {
      assetManifest = assetParse(m);
    })
    .catch((err) => assetWarn(err.message));
}
