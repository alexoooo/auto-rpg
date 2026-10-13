import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { verifyFrozenEvaluator } from './frozen-evaluator.mjs';

// Historical replay runs in its own process, separate from the current world's engine instance.
verifyFrozenEvaluator();
const files = readdirSync('tests/frozen').filter(file => file.endsWith('.test.mjs')).map(file => `tests/frozen/${file}`);
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
verifyFrozenEvaluator();
process.exit(result.status ?? 1);
