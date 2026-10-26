'use strict';
// Publish only the four generated data files, without merging preview code.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { execFileSync } = require('node:child_process');
const DATA_PATHS = ['dist/catalog.json', 'dist/source-snapshot.json', 'dist/collector-status.json', 'dist/admin/status.json'];
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const read = (cwd, file) => JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8'));

function validateBundle(cwd, baseline, runId) {
  const catalog = read(cwd, DATA_PATHS[0]), snapshot = read(cwd, DATA_PATHS[1]), report = read(cwd, DATA_PATHS[2]);
  assert.ok(catalog.status === 'ready' && Array.isArray(catalog.products) && snapshot.items?.length > 0, 'Refusing empty or unready data');
  assert.ok(Number.isFinite(Date.parse(catalog.asOf)), 'Catalog timestamp is required');
  assert.ok(Date.parse(catalog.asOf) <= Date.now() + 300000, 'Future catalog timestamp');
  const { buildCatalog } = require(path.join(cwd, 'scripts/build-catalog.cjs'));
  assert.ok(isDeepStrictEqual(catalog, JSON.parse(JSON.stringify(buildCatalog(snapshot)))), 'Catalog must match the verified source snapshot');
  if (!catalog.products.length) assert.ok(catalog.publicationExclusions?.length === snapshot.items.length && catalog.publicationExclusions.every(x => ['service_fee', 'confirmed_out_of_stock'].includes(x.code)) && catalog.publicationExclusions.some(x => x.code === 'confirmed_out_of_stock'), 'Empty publication requires complete confirmed exclusion evidence');
  assert.ok(report.checkpointOnly === false && Number.isFinite(Date.parse(report.finishedAt)) && !report.executionError, 'Incomplete or fatal collection cannot publish');
  assert.ok(Array.isArray(report.sources) && report.sources.length > 0, 'Missing durable source state');
  if (runId) assert.equal(String(report.githubRunId), String(runId), 'Report must belong to this run');
  if (baseline) {
    const previous = JSON.parse(git(cwd, 'show', baseline + ':' + DATA_PATHS[0]));
    assert.ok(Date.parse(catalog.asOf) >= Date.parse(previous.asOf), 'Catalog time cannot regress');
    const old = new Map(previous.products.map(product => [product.id, product]));
    for (const product of catalog.products) if (old.has(product.id)) {
      assert.ok(Date.parse(product.observedAt) >= Date.parse(old.get(product.id).observedAt), 'Product observation cannot regress: ' + product.id);
    }
    if (report.executionSkippedReason === 'not_due') {
      for (const file of DATA_PATHS.slice(0, 2)) assert.ok(isDeepStrictEqual(read(cwd, file), JSON.parse(git(cwd, 'show', baseline + ':' + file))), 'not_due cannot alter product data');
    }
  }
}

function publish({ cwd = process.cwd(), mainBase, previewBase, runId, validate = directory => {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], { cwd: directory, stdio: 'inherit', shell: process.platform === 'win32' });
} } = {}) {
  for (const sha of [mainBase, previewBase]) assert.match(sha || '', /^[0-9a-f]{40}$/, 'Explicit starting commits are required');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), mainBase, 'Collector must use the pinned main commit');
  validateBundle(cwd, mainBase, runId);
  const bases = { main: mainBase, preview: previewBase };
  const remoteHeads = () => Object.fromEntries(git(cwd, 'ls-remote', 'origin', 'refs/heads/main', 'refs/heads/preview').split('\n').filter(Boolean).map(line => {
    const [sha, ref] = line.split(/\s+/); return [ref.split('/').at(-1), sha];
  }));
  assert.deepEqual(remoteHeads(), bases, 'Branches moved during collection; leave remote data untouched');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-publish-'));
  const commits = {};
  try {
    for (const branch of ['main', 'preview']) {
      const target = path.join(temp, branch);
      git(cwd, 'worktree', 'add', '--detach', target, bases[branch]);
      try {
        for (const file of DATA_PATHS) fs.copyFileSync(path.join(cwd, file), path.join(target, file));
        // Main has already passed npm test in the workflow. Validate preview's
        // own code against the candidate, without executing it on main.
        validateBundle(target, bases[branch], runId);
        if (branch === 'preview') validate(target);
        validateBundle(target, bases[branch], runId);
        assert.equal(git(target, 'rev-parse', 'HEAD'), bases[branch], 'Validation must not commit code');
        for (const file of DATA_PATHS) assert.ok(fs.readFileSync(path.join(target, file)).equals(fs.readFileSync(path.join(cwd, file))), 'Validation must not rewrite candidate data');
        git(target, 'add', '--', ...DATA_PATHS);
        const changed = git(target, 'diff', '--cached', '--name-only').split('\n').filter(Boolean);
        assert.ok(changed.every(file => DATA_PATHS.includes(file)), 'Only generated data can publish');
        if (changed.length) git(target, 'commit', '-m', 'Refresh verified catalog data' + (runId ? ' (run ' + runId + ')' : ''));
        commits[branch] = git(target, 'rev-parse', 'HEAD');
      } finally {
        git(cwd, 'worktree', 'remove', '--force', target);
      }
    }
    assert.deepEqual(remoteHeads(), bases, 'Branches moved during validation; leave remote data untouched');
    // Both commits are children of the exact starting refs. A race at push is
    // rejected for BOTH branches. Never force, rebase data, or rerun collection.
    git(cwd, 'push', '--atomic', 'origin', commits.main + ':refs/heads/main', commits.preview + ':refs/heads/preview');
    const observed = remoteHeads();
    for (const branch of ['main', 'preview']) assert.equal(observed[branch], commits[branch], 'Remote publication needs verification: ' + branch);
    console.log(JSON.stringify({ published: true, commits }));
    return commits;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (require.main === module) {
  try { publish({ mainBase: process.env.MAIN_BASE, previewBase: process.env.PREVIEW_BASE, runId: process.env.GITHUB_RUN_ID }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { DATA_PATHS, validateBundle, publish };
