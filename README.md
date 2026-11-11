# Auto-RPG

A browser game of physically simulated combat.  
Fighters have bodies driven by muscles, each controlled by an AI.  

**[Play it in your browser](https://alexoooo.github.io/auto-rpg/).**

## Development

Needs Node 22.18 or newer on the 22.x line, or Node 24.11 or newer, Git LFS, and Windows or Linux x64 to build the art.

```powershell
git lfs install; git lfs pull
npm ci
npm run assets  # build the art
npm run dev     # http://localhost:5180
```

[AGENTS.md](AGENTS.md) holds the rules for working here.

## Licence

MIT ([LICENSE](LICENSE)).  
Third-party assets keep their own licences, listed in `assets/art/catalog.json`.  
