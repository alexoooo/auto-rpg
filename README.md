# Auto-RPG

A browser game of physically simulated, AI-driven combat. Fighters are bodies driven by muscles,
each controlled by an AI; there are no animations, only physics.

**[Play it in your browser](https://alexoooo.github.io/auto-rpg/).** In the Arena and the Dungeon,
`?` shows the controls.

## Screens

| Screen | What it is |
| --- | --- |
| **Arena** | two fighters in a bout; watch, or switch control between them |
| **Dungeon** | lead a party through a crypt |
| **Lab** | one body put through its skills |
| **Ratings** | how well each AI and skill does |
| **Tools** | development viewers |

## Run it locally

Needs Node 22.13.0 or newer, Git LFS, and Windows or Linux x64 to build the art.

```powershell
git lfs install; git lfs pull
npm ci
npm run assets  # build the art
npm run dev     # http://localhost:5180
```

## Licence

MIT ([LICENSE](LICENSE)). Third-party assets keep their own licences, listed in
`assets/art/catalog.json`. [AGENTS.md](AGENTS.md) holds the rules for working here.
