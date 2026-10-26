'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { DATA_PATHS, publish, validateBundle } = require('../scripts/publish-catalog.cjs');
const { buildCatalog } = require('../scripts/build-catalog.cjs');
const root = path.join(__dirname, '..');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-publication-test-'));
  const cwd = path.join(temp, 'working'), remote = path.join(temp, 'remote.git');
  fs.mkdirSync(cwd);
  const save = (file, value) => { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), JSON.stringify(value) + '\n'); };
  try {
    git(temp, 'init', '--bare', remote); git(cwd, 'init', '-b', 'main');
    git(cwd, 'config', 'user.name', 'Publication test'); git(cwd, 'config', 'user.email', 'test@example.invalid');
    for (const file of ['scripts/build-catalog.cjs', 'dist/data-model.js', 'dist/gear-taxonomy.js']) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(cwd, file));
    }
    const snapshot = require('./isolated-snapshot.cjs')();
    // The isolated snapshot starts empty; one known valid item is enough for
    // real schema/build validation without copying production data to the remote.
    snapshot.items = [structuredClone(require('../dist/source-snapshot.json').items[0])];
    delete snapshot.snapshot_at_utc;
    save(DATA_PATHS[1], snapshot); save(DATA_PATHS[0], buildCatalog(snapshot));
    const report = { checkpointOnly: false, finishedAt: new Date().toISOString(), sources: [{ id: 'fixture' }], githubRunId: '123' };
    save(DATA_PATHS[2], report); save(DATA_PATHS[3], { sources: [] });
    fs.writeFileSync(path.join(cwd, 'app.txt'), 'approved main');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'baseline');
    const mainBase = git(cwd, 'rev-parse', 'HEAD');
    git(cwd, 'checkout', '-b', 'preview'); fs.writeFileSync(path.join(cwd, 'app.txt'), 'unapproved preview feature');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'preview only');
    const previewBase = git(cwd, 'rev-parse', 'HEAD'); git(cwd, 'checkout', 'main');
    git(cwd, 'remote', 'add', 'origin', remote); git(cwd, 'push', 'origin', 'main', 'preview');
    report.finishedAt = new Date(Date.now() + 1000).toISOString(); save(DATA_PATHS[2], report);
    const options = { cwd, mainBase, previewBase, runId: '123', validate: () => {} };
    fn({ cwd, remote, save, report, snapshot, options, mainBase, previewBase });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test('data-only atomic publication preserves divergent preview features and supports not_due', () => fixture(({ cwd, remote, save, report, options, mainBase, previewBase }) => {
  report.executionSkippedReason = 'not_due'; save(DATA_PATHS[2], report);
  const commits = publish(options);
  assert.equal(git(remote, 'rev-parse', 'main'), commits.main);
  assert.equal(git(remote, 'rev-parse', 'preview'), commits.preview);
  assert.equal(git(remote, 'show', 'main:app.txt'), 'approved main');
  assert.equal(git(remote, 'show', 'preview:app.txt'), 'unapproved preview feature');
  for (const [branch, base] of [['main', mainBase], ['preview', previewBase]]) {
    assert.equal(git(remote, 'rev-parse', branch + '^'), base);
    assert.deepEqual(git(remote, 'diff', '--name-only', base, branch).split('\n'), [DATA_PATHS[2]]);
    assert.equal(git(remote, 'rev-parse', branch + ':' + DATA_PATHS[0]), git(remote, 'rev-parse', base + ':' + DATA_PATHS[0]));
  }
}));
test('empty, mismatched, incomplete, fatal, wrong-run and regressing data are rejected', () => fixture(({ cwd, save, report, snapshot, options }) => {
  const good = buildCatalog(snapshot);
  for (const mutate of [
    () => save(DATA_PATHS[0], { ...good, products: [] }),
    () => save(DATA_PATHS[0], { ...good, notice: 'not the verified snapshot' }),
    () => save(DATA_PATHS[2], { ...report, checkpointOnly: true }),
    () => save(DATA_PATHS[2], { ...report, executionError: 'fatal' }),
    () => save(DATA_PATHS[2], { ...report, githubRunId: 'other' }),
    () => { const old = structuredClone(snapshot); old.items[0].observed_at_utc = '2020-01-01T00:00:00.000Z'; save(DATA_PATHS[1], old); save(DATA_PATHS[0], buildCatalog(old)); }
  ]) {
    save(DATA_PATHS[0], good); save(DATA_PATHS[1], snapshot); save(DATA_PATHS[2], report); mutate();
    assert.throws(() => validateBundle(cwd, options.mainBase, '123'));
  }
}));
test('not_due cannot publish changed prices even if schema-valid', () => fixture(({ cwd, save, snapshot, report, options }) => {
  snapshot.items[0].price_amount += 1; save(DATA_PATHS[1], snapshot); save(DATA_PATHS[0], buildCatalog(snapshot));
  save(DATA_PATHS[2], { ...report, executionSkippedReason: 'not_due' });
  assert.throws(() => publish(options), /not_due/);
}));
test('validation failure changes neither remote branch', () => fixture(({ remote, options, mainBase, previewBase }) => {
  assert.throws(() => publish({ ...options, validate: () => { throw Error('preview validation failed'); } }), /preview validation failed/);
  assert.equal(git(remote, 'rev-parse', 'main'), mainBase); assert.equal(git(remote, 'rev-parse', 'preview'), previewBase);
}));
test('a concurrent preview update aborts both publications', () => fixture(({ cwd, remote, options, mainBase, previewBase }) => {
  const validate = directory => {
    const competing = git(directory, 'commit-tree', git(directory, 'rev-parse', previewBase + '^{tree}'), '-p', previewBase, '-m', 'concurrent change');
    git(directory, 'push', 'origin', competing + ':preview');
  };
  assert.throws(() => publish({ ...options, validate }), /Branches moved/);
  assert.equal(git(remote, 'rev-parse', 'main'), mainBase); assert.notEqual(git(remote, 'rev-parse', 'preview'), previewBase);
}));
test('server rejection of one ref rejects the entire atomic push', { skip: process.platform === 'win32' }, () => fixture(({ remote, options, mainBase, previewBase }) => {
  fs.writeFileSync(path.join(remote, 'hooks/update'), '#!/bin/sh\n[ "$1" != refs/heads/preview ]\n', { mode: 0o755 });
  assert.throws(() => publish(options));
  assert.equal(git(remote, 'rev-parse', 'main'), mainBase); assert.equal(git(remote, 'rev-parse', 'preview'), previewBase);
}));
