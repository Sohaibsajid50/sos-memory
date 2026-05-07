const fs = require('fs/promises');
const path = require('path');
const { ensureDir, exists, readJson, writeFileWithBackup, writeJsonWithBackup } = require('./fs-utils');
const { getRegistryPath } = require('./paths');
const { assertSupportedRegistry } = require('./registry');

function projectNameFromFolder(folder) {
  return path.basename(folder).replace(/^\d+-/, '').replaceAll('-', ' ');
}

async function scanNumberedFolders(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => /^\d+-/.test(entry.name) && !entry.name.startsWith('00-'))
    .map((entry) => path.join(root, entry.name));
}

async function bootstrapProject(folder, options = {}) {
  const env = options.env || process.env;
  const registryPath = options.registryPath || getRegistryPath(env);
  const registry = await readJson(registryPath);
  assertSupportedRegistry(registry);

  const projectPath = path.resolve(folder);
  const slug = path.basename(projectPath);
  const name = options.name || projectNameFromFolder(projectPath);
  const vaultPage = path.join(registry.vault_root, 'Projects', `${slug}.md`);
  const backupRoot = options.backupRoot;
  const project = { name, path: projectPath, vault_page: vaultPage, qmd_collection: slug };

  if (!registry.projects.some((item) => item.path === projectPath)) {
    registry.projects.push(project);
    await writeJsonWithBackup(registryPath, registry, { backupRoot });
  }

  if (!(await exists(vaultPage))) {
    await writeFileWithBackup(
      vaultPage,
      `# ${name}\n\n## Purpose\n- Durable project memory for ${name}.\n\n## Current State\n- Created by sos bootstrap-project.\n\n## Links\n- Source: ${projectPath}\n`,
      { backupRoot }
    );
  }

  const qmdDir = path.join(registry.vault_root, '.qmd');
  await ensureDir(qmdDir);
  const collectionPath = path.join(qmdDir, 'collections.json');
  const collections = (await exists(collectionPath)) ? await readJson(collectionPath) : {};
  collections[slug] = { path: projectPath };
  await writeJsonWithBackup(collectionPath, collections, { backupRoot });

  const actionLog = path.join(registry.documents_root, '00-Inbox', 'AI-ACTION-LOG.md');
  await ensureDir(path.dirname(actionLog));
  await fs.appendFile(actionLog, `\n- ${new Date().toISOString()}: sos bootstrap-project registered ${projectPath}\n`);
  console.log(`Bootstrapped ${name}`);
  return project;
}

module.exports = {
  bootstrapProject,
  projectNameFromFolder,
  scanNumberedFolders
};
