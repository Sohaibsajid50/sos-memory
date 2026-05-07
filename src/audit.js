const fs = require('fs/promises');
const path = require('path');
const { exists, readJson } = require('./fs-utils');
const { getRegistryPath } = require('./paths');

async function findFiles(root, filename, results = []) {
  if (!(await exists(root))) return results;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.git')) {
      await findFiles(target, filename, results);
    } else if (entry.name === filename) {
      results.push(target);
    }
  }
  return results;
}

async function auditVault(options = {}) {
  const registryPath = options.registryPath || getRegistryPath(options.env || process.env);
  const suggestions = [];

  if (!(await exists(registryPath))) {
    suggestions.push('Missing registry. Run sos install.');
  } else {
    const registry = await readJson(registryPath);
    const vaultProjects = path.join(registry.vault_root, 'Projects');
    for (const project of registry.projects || []) {
      if (!(await exists(project.path))) suggestions.push(`Registry drift: missing project path ${project.path}`);
      if (project.vault_page && !(await exists(project.vault_page))) {
        suggestions.push(`Missing project page: ${project.vault_page}`);
      }
    }

    const handoffs = await findFiles(registry.documents_root, '.continues-handoff.md');
    for (const handoff of handoffs) {
      suggestions.push(`Review bridge handoff for promotion into durable memory: ${handoff}`);
    }

    if (!(await exists(vaultProjects))) suggestions.push(`Missing vault Projects folder: ${vaultProjects}`);
  }

  if (!suggestions.length) suggestions.push('No vault audit suggestions.');
  for (const suggestion of suggestions) console.log(`- ${suggestion}`);
  return suggestions;
}

async function inspectContinues(options = {}) {
  const cwd = options.cwd || process.cwd();
  const handoffPath = path.join(cwd, '.continues-handoff.md');
  if (!(await exists(handoffPath))) {
    console.log('No .continues-handoff.md found in the current project.');
    return null;
  }

  const content = await fs.readFile(handoffPath, 'utf8');
  const firstLines = content.split('\n').slice(0, 20).join('\n');
  console.log('Continues handoff is bridge context. Promote durable facts to daily, project, or decision memory.');
  console.log(firstLines);
  return { path: handoffPath, preview: firstLines };
}

module.exports = {
  auditVault,
  inspectContinues
};
