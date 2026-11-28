/**
 * **The ground tries' fit** (`GroundTries`, `src/minds/option/predictions/ground-tries.ts`), for the
 * measuring command (`measure.mjs`): of a record's rows, each try of a way up or a regain a side
 * took (`triesOf`), and for each Option and the posture it was begun lying in, what its tries did
 * (`fitTries`): their seconds at the mean and the share of them that ended in each posture, as a
 * ground Option's model asks them (`groundWay`).
 *
 * A try begins at a root whose Option taken (`ran`) is a way up or a regain (its line's kind, where
 * the search weighed it), lying as the root reads the body (`reading.posture`), and ends at the next
 * root of its side that takes another Option, or a way up anew: a way up is committed, so taken
 * again it is a try of its own; a regain yields, so taken again it goes on. Its seconds are from
 * its beginning to its end, and the seconds a regain's try had held as it was begun (`regained`,
 * none for a way up); where it ends is the posture that root reads. A try the bout's end cut is not
 * read.
 */

/** The kinds of Option whose tries are read, and whether each goes on where it is taken again. */
const KINDS = Object.freeze({ "way up": false, regain: true });

/** The least tries an Option's posture is fitted from, fitted and held out alike: fewer read nothing, so its profile or guess prices it. */
const LEAST = 20;

/**
 * **The ground tries of a record's `row`**, each `{ name, from, seconds, end }`: its Option's name,
 * the posture it was begun lying in, its seconds and the posture it ended in.
 */
export function triesOf(row) {
  const tries = [];
  for (const side of ["left", "right"]) {
    let open = null;
    for (const root of row.roots) {
      if (root.side !== side) continue;
      const name = root.ran ? row.options[root.ran[0]] : null;
      if (open && name !== null && !(name === open.name && open.goesOn)) {
        tries.push({ name: open.name, from: open.from, seconds: root.t - open.t + open.regained, end: root.reading.posture });
        open = null;
      }
      if (open || name === null) continue;
      const line = root.lines.find((l) => l[0] === root.ran[0] && l[1] === root.ran[1]), kind = line?.[2];
      if (kind in KINDS) open = { name, from: root.reading.posture, t: root.t, regained: root.reading.regained ?? 0, goesOn: KINDS[kind] };
    }
  }
  return tries;
}

/** What `tries` did, by weight (`weight`): their seconds at the mean and the share ending in each posture, the likeliest first. */
function summed(tries) {
  let whole = 0, seconds = 0;
  const ends = new Map();
  for (const one of tries) { whole += one.weight; seconds += one.weight * one.seconds; ends.set(one.end, (ends.get(one.end) ?? 0) + one.weight); }
  return { seconds: seconds / whole, ends: [...ends].sort((a, b) => b[1] - a[1]).map(([at, share]) => [at, share / whole]) };
}

/** `tries` by Option and the posture it was begun in. */
function cells(tries) {
  const by = new Map();
  for (const one of tries) {
    const key = `${one.name}\u0000${one.from}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(one);
  }
  return [...by.values()].sort((a, b) => b.length - a.length);
}

/**
 * **The ground tries fitted** to `tries` (`{ name, from, seconds, end, held, weight }`), those held
 * out read against them (`say`): for each Option and posture with at least `LEAST` tries, their
 * `tries`, `seconds` and `ends` (`[posture, share]`). Its `fitted` and `held` count the tries.
 */
export function fitTries(tries, say) {
  const ways = {};
  let fitted = 0, held = 0;
  for (const cell of cells(tries)) {
    const { name, from } = cell[0], fit = cell.filter((one) => !one.held), out = cell.filter((one) => one.held);
    if (cell.length < LEAST || !fit.length) { say(`${name} from ${from}: ${cell.length} tries, too few`); continue; }
    const made = summed(fit);
    (ways[name] ??= {})[from] = { tries: fit.length, ...made };
    fitted += fit.length; held += out.length;
    say(`${name} from ${from}: ${fit.length} tries fitted, ${out.length} held out; ${readOf(made, out)}`);
  }
  return { ways, fitted, held };
}

/** How `made` reads the held-out tries `out`: their seconds at the mean against its, and the share ending where it says they most end. */
function readOf(made, out) {
  const [at, share] = made.ends[0];
  const says = `${made.seconds.toFixed(2)} s, ${(share * 100).toFixed(0)} % ending ${at}`;
  if (!out.length) return `${says}; none held out`;
  const them = summed(out), theirs = them.ends.find(([end]) => end === at)?.[1] ?? 0;
  return `${says}; held out ${them.seconds.toFixed(2)} s, ${(theirs * 100).toFixed(0)} % ending ${at}`;
}

/** **The ground tries in place**, `ways`, read on the held-out `tries` (`say`). */
export function readTries(ways, tries, say) {
  for (const cell of cells(tries.filter((one) => one.held))) {
    const { name, from } = cell[0], made = ways[name]?.[from];
    say(`${name} from ${from}: ${made ? readOf(made, cell) : `not in the asset in place (${cell.length} held out)`}`);
  }
}
