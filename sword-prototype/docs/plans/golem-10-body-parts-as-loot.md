# Session 10 -- body parts as loot

**Status (2026-09-04): implemented, human gate not yet asked.** A module whose socket a blow broke
with the rest of it in one piece survives the verdict as a checksummed parts-bin entry the setup
screen can fit back on, at the durability it came off with and drawn worn by the salvaged damage-wear
shader; measured in the Node arena at a blade's own 0.8696 of its module and in the page at the
shader's own two wear thresholds read off the pixels, with all ten mutations of the rule and the
codec watched red. Thresholds provisional.

## Outcome

The One Must Fall loop closed at prototype scale: a module severed in a bout survives the
verdict as a thing, the winner keeps the ones that came off intact, and the next bout's setup
offers them as options to fit. Modding the unit replaces finding equipment.

## Frozen choices

- A severed module is loot if its socket joint broke and the module's own parts still have
  health above zero. A module cut to pieces is debris. That rule reads existing facts; it adds
  no new damage model. The loot unit is the whole module, chain and terminal together; a
  terminal snapped off its chain is not loot this session, because no weld has health yet.
- The parts bin is per browser, in `localStorage`, as the construct library was; it is a list of
  module option ids with their remaining durability, checksummed. Losing it costs nothing that
  cannot be rebuilt from the shelf, so there is no import or export.
- Wear is visible. Remaining durability drives the salvaged procedural damage-wear plugin on the
  module's shell, so a fitted second-hand blade looks second-hand. Presentation reads authority
  and never feeds it.
- No in-arena pickup this session. The winner collects at the verdict. Picking a part up mid-bout
  is a later idea and is written down as one, not built.

## Implement

1. At verdict, walk the loser's severed modules, apply the loot rule, and append qualifying
   option ids with durability to the winner's bin. The banner names what was taken.
2. `src/golem/parts-bin.ts`: the checksummed store and its codec, with a test that refuses
   damaged data rather than substituting defaults.
3. The setup screen's golem picker lists bin entries beside the shelf, marked with durability, and
   a fitted bin entry starts the bout with that durability and that wear. A part that reaches zero
   in a bout is gone from the bin.
4. A reset control in setup that empties the bin, because a prototype without one is a prototype
   somebody has to clear from the console.
5. `tests/golem-loot.test.mjs`: a bout in which the Warrior severs the golem's primary at a known
   durability leaves exactly that entry; a module destroyed rather than severed leaves nothing;
   the codec round-trips and refuses corruption.

## Human gate

The owner plays two bouts in a row, loses a module in the first, fits the enemy's in the second.
The question: does taking a part off a beaten golem and wearing it feel like the game this was
meant to be. The verdict goes into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-loot.test.mjs
npm test
npm run build
git diff --check -- .
```
