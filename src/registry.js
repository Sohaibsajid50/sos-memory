const path = require('path');
const { backupFile, exists, readJson, writeJsonWithBackup } = require('./fs-utils');

function createRegistry({ documentsRoot, vaultRoot, pendingRoot }) {
  return {
    version: 1,
    documents_root: path.resolve(documentsRoot),
    vault_root: path.resolve(vaultRoot),
    pending_root: path.resolve(pendingRoot),
    projects: []
  };
}

function assertSupportedRegistry(registry) {
  if (!registry || registry.version !== 1) {
    throw new Error('Unsupported registry version. A backup was created; manual migration is required.');
  }
}

function mergeProjects(existing, incomingProjects = []) {
  assertSupportedRegistry(existing);
  const seen = new Set(existing.projects.map((project) => project.path));
  const merged = [...existing.projects];

  for (const project of incomingProjects) {
    if (!project.path || seen.has(project.path)) continue;
    merged.push(project);
    seen.add(project.path);
  }

  return { ...existing, projects: merged };
}

function resolveProject(registry, folder) {
  assertSupportedRegistry(registry);
  const resolvedFolder = path.resolve(folder);
  return registry.projects
    .filter((project) => resolvedFolder.startsWith(path.resolve(project.path)))
    .sort((left, right) => right.path.length - left.path.length)[0] || null;
}

async function loadOrCreateRegistry(registryPath, defaults, options = {}) {
  if (!(await exists(registryPath))) {
    const registry = createRegistry(defaults);
    await writeJsonWithBackup(registryPath, registry, options);
    return { registry, created: true };
  }

  const registry = await readJson(registryPath);
  try {
    assertSupportedRegistry(registry);
  } catch (error) {
    if (options.backupRoot) await backupFile(registryPath, options.backupRoot);
    throw error;
  }
  return { registry, created: false };
}

async function saveMergedRegistry(registryPath, incomingProjects, options = {}) {
  const registry = await readJson(registryPath);
  const merged = mergeProjects(registry, incomingProjects);
  await writeJsonWithBackup(registryPath, merged, options);
  return merged;
}

module.exports = {
  assertSupportedRegistry,
  createRegistry,
  loadOrCreateRegistry,
  mergeProjects,
  resolveProject,
  saveMergedRegistry
};
