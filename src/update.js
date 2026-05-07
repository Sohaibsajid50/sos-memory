const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const { install } = require('./install');
const { exists } = require('./fs-utils');
const { getInstalledVersionPath, getRepoRoot } = require('./paths');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function readInstalledVersion(env = process.env) {
  const versionPath = getInstalledVersionPath(env);
  return (await exists(versionPath)) ? (await fs.readFile(versionPath, 'utf8')).trim() : null;
}

async function update(options = {}) {
  const repoRoot = options.repoRoot || getRepoRoot(options.entrypoint || __filename);
  const beforeVersion = await readInstalledVersion(options.env);
  const beforeHead = run('git', ['rev-parse', '--short', 'HEAD'], repoRoot);

  run('git', ['pull', 'origin', 'main'], repoRoot);

  const afterHead = run('git', ['rev-parse', '--short', 'HEAD'], repoRoot);
  const changelog = beforeHead === afterHead
    ? 'No git changes pulled.'
    : run('git', ['log', '--oneline', `${beforeHead}..${afterHead}`], repoRoot);

  await install({ ...options, repoRoot, auto: true });
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));

  console.log(`Previous installed version: ${beforeVersion || 'none'}`);
  console.log(`Current repo version: ${packageJson.version}`);
  console.log(changelog);
  return { beforeVersion, currentVersion: packageJson.version, changelog };
}

module.exports = {
  readInstalledVersion,
  update
};
