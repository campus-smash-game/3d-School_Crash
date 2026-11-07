import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const RELEASE16_BASELINE = Object.freeze({
  commit: 'a656cf0300615299e55e01cf7f9c11be14115346',
  campus: '8c91fc2b95d2d39698ab10eea3d89a4ec10f785392dc58e267b2585a911aac64',
  osm: 'a3f87707e99b1cec9a8603aac5a3a99fa84e5005f8e0da0d38c05195804b3598',
  dem: '94d64c1957ed0073137edcbea7e5d450692f2db5a10275379b8fe085fd45ef6a',
  terrainSource: '532aba02619d7816ab8ea5818150657848331f1eec67349681d38cdb98fa636f',
  terrainModule: 'dbc92df074e6e9fcb73c2ef6b022b64cde3e03443fabaf01e2c06d5aa225fc3e',
});
const hash = value => createHash('sha256').update(value).digest('hex');

/** Rebuild ignored fixtures from pinned Git objects; existing files are verified, never replaced. */
export async function ensureCampusProvenanceBaseline(root, paths = {}) {
  const files = {
    campus: paths.campus ?? 'artifacts/engineering303-review/pre-supplement-campus.json',
    module: paths.module ?? 'artifacts/campus-provenance-test/baseline-terrain.mjs',
    provenance: paths.provenance ?? 'artifacts/campus-provenance-test/baseline-provenance.json',
  };
  const baseline = RELEASE16_BASELINE;
  const fromGit = file => execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'show', `${baseline.commit}:${file}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  const campus = fromGit('public/data/campus.json'), source = fromGit('src/terrain.ts');
  assert.equal(hash(campus), baseline.campus, 'pinned Git campus hash mismatch');
  assert.equal(hash(source), baseline.terrainSource, 'pinned Git terrain source hash mismatch');
  const compiled = ts.transpileModule(source.toString('utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'");
  assert.equal(hash(compiled), baseline.terrainModule, 'pinned terrain compilation hash mismatch');
  const created = [];
  async function ensure(file, content, verify) {
    const absolute = path.resolve(root, file);
    let existing;
    try { existing = await readFile(absolute); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(path.dirname(absolute), { recursive: true });
      try { await writeFile(absolute, content, { flag: 'wx' }); created.push(file); }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
      existing = await readFile(absolute);
    }
    verify(existing);
  }
  await ensure(files.campus, campus, value => assert.equal(hash(value), baseline.campus, 'existing baseline campus differs; refusing to replace it'));
  await ensure(files.module, compiled, value => assert.equal(hash(value), baseline.terrainModule, 'existing baseline module differs; refusing to replace it'));
  const provenance = {
    releaseCommit: baseline.commit, source: 'Exact Git blobs, compiled locally with the installed TypeScript compiler and checked against fixed hashes',
    sourcePaths: { campus: 'public/data/campus.json', terrain: 'src/terrain.ts' },
    terrainSourceSha256: baseline.terrainSource, compiledSha256: baseline.terrainModule,
    baselineCampus: files.campus, baselineCampusSha256: baseline.campus,
    baselineRawOsmSha256: baseline.osm, baselineRawDemSha256: baseline.dem,
  };
  await ensure(files.provenance, JSON.stringify(provenance, null, 2) + '\n', value => {
    const saved = JSON.parse(value.toString('utf8'));
    for (const key of ['releaseCommit', 'compiledSha256', 'baselineCampusSha256', 'baselineRawOsmSha256', 'baselineRawDemSha256']) assert.equal(saved[key], provenance[key], 'existing baseline provenance mismatch: ' + key);
    assert.equal(saved.terrainSourceSha256 ?? saved.provenanceRow?.gitSourceSha256, baseline.terrainSource, 'existing provenance terrain source mismatch');
  });
  return { paths: files, created, sourceCommit: baseline.commit, hashes: { campus: baseline.campus, terrainSource: baseline.terrainSource, module: baseline.terrainModule } };
}
