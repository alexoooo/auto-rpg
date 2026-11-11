# Readable code: Option Mind's build, then Parts

## Why

A person who opens the code that builds an Option Mind cannot follow it, and the same is true of
the code for parts, which every mind is made of. This plan cleans those two places and nothing
else. The first is small and is shown to the owner before the second starts.

**The goal**: a person reads how an Option Mind is built from top to bottom in one file, finds
each thing it is made of as a named type, and follows every call by go-to-definition.

**What must not move**: every fingerprint case (`node scripts/fingerprint.mjs`, about a minute and
a half), `npm run check`, `npm test`, `npm run build`.

**How the work goes**: small commits, each with those checks. No new test, lint or gate. Nothing
that runs every world step gains an object, an array or a closure: the changes are to code that
builds and checks a mind, and a mind's memory stays plain data in its `state`.

## 1. Option Mind's build

The code is in place, and the [architecture](../architecture.md)'s Minds section describes it:

- **`OptionMind` is a declared type** (`src/minds/option/build.ts`) that names what a running
  Option Mind gives the fight: its skills, its state and its report. `create` returns it.
  The build (`buildOptionMind`) reads in order, six steps, each value named before the call that
  uses it.
- **The file is split by job**: `config.ts`, the config and its faults; `description.ts`, the
  description a screen reads; `build.ts`, the build; `mind.ts`, the controller that calls them.
- **Option Mind calls `waysUpIn`, `withWaysUp` and `standUpFaults` itself**; the application
  passes only its defaults.
- **A mind's maker is given one thing, its host** (`BodyHost`), and `Controller.create` takes the
  host and the config. The names that remain differ in meaning: `MindWiring`, `BodyHost`,
  `MindConstruction`, `CommandedMind`, `MindMade`, `Minded`.

What is left: the owner reads `src/minds/option/build.ts`. Part 2 starts when the owner finds it
readable; where they do not, the approach changes before more code is touched.

## 2. Parts

What is hard to follow now:

- **`Part` carries every role's concerns** (`src/parts/parts.ts`, about 20 members): what a
  screen shows (`label`, `offered`, `fields`, `phases`), strikes (`strikes`), guards
  (`supportedEquipment`), orders (`obeys`), data loading (`reads`, `fitReads`) and the tree
  (`slots`, `slotsFor`, `children`, `uses`).
- **The walk over a part's children is written by hand four times**: twice in
  `partRequirements`, in Option Mind's description, and inside the catalog
  (`src/minds/catalog/catalog.ts`).
- **A config is `{ kind: string }`.** A misspelt kind compiles and fails when the catalog looks
  it up, and code reads a config by casting it; `src/` holds 206 `as unknown as` casts.
- **The catalog is one 300-line function** (`catalogOf`) returning about 20 members, seven of
  them walks of a part tree.

What it becomes, in this order:

1. **One function walks a part tree**, in `src/parts/`, and the four hand-written walks call it.
2. **`Part` keeps what every part has** (its role, defaults, slots, `fits`, `faults`). What only
   one role uses moves to that role's own type; what a screen shows moves beside the part and is
   read by `src/app/browser/`.
3. **A slot's config is typed by the kinds its role registers**, so a misspelt kind fails to
   compile. A role's kinds are the map its parts already extend (`GuardConfigs`, `AimConfigs`,
   `TechniqueConfigs`); a kind an entrant registers keeps a plain string.
4. **The catalog's tree walks become plain functions** over the walker.

How it is checked: the fingerprint is unmoved, and the count of `as unknown as` casts is
reported before and after.

## When it lands

The architecture names the types that remain, and this plan is deleted.
