import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The stand-up acceptance evaluator's immutable commit, independent of tags available in a clone.
const revision = '72c9ccb4785810fb80c9c6b9aefd09260db4f8be';
const root = fileURLToPath(new URL('../', import.meta.url));
export const frozenEvaluator = new URL('../.tools/stand-up-frozen/', import.meta.url);
const directory = fileURLToPath(frozenEvaluator);
const git = (args, cwd = directory) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function verifyDependencyDirectory() {
  const modules = new URL('node_modules/', frozenEvaluator);
  if (existsSync(modules)) assert.equal(realpathSync(modules), join(realpathSync(directory), 'node_modules'),
    'evaluator dependencies must not link to another checkout');
}

/** A pinned checkout and runtime are mandatory; historical checkpoints are never migrated. */
export function verifyFrozenEvaluator() {
  assert.ok(existsSync(new URL('.git', frozenEvaluator)), 'run npm run setup:frozen first');
  assert.equal(git(['rev-parse', 'HEAD']), revision, 'frozen evaluator commit');
  assert.equal(git(['diff', revision, '--', '.']), '', 'frozen evaluator tracked files must be unchanged');
  const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozenEvaluator)));
  assert.equal(process.versions.node, manifest.node, 'frozen V8 checkpoints require their captured Node version');
  assert.ok(existsSync(new URL('node_modules/.package-lock.json', frozenEvaluator)), 'run npm run setup:frozen to install the evaluator dependencies');
  verifyDependencyDirectory();
  return revision;
}

if (process.argv.includes('--prepare')) {
  if (!existsSync(new URL('.git', frozenEvaluator))) {
    git(['worktree', 'add', '--detach', directory, revision], root);
  }
  assert.equal(git(['rev-parse', 'HEAD']), revision, 'refusing to install into a different checkout');
  assert.equal(git(['diff', revision, '--', '.']), '', 'refusing a modified evaluator');
  const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozenEvaluator)));
  assert.equal(process.versions.node, manifest.node, 'use the captured Node version to install and run the evaluator');
  verifyDependencyDirectory();
  assert.ok(process.env.npm_execpath, 'prepare through npm run setup:frozen');
  execFileSync(process.execPath, [process.env.npm_execpath, 'ci'], { cwd: directory, stdio: 'inherit' });
  verifyFrozenEvaluator();
}
